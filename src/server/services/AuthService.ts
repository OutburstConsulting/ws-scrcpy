import session, { Session, SessionOptions } from 'express-session';
import type { Request, Response } from 'express';
import { Issuer, Client, generators } from 'openid-client';
import * as samlify from 'samlify';
import type * as http from 'http';
import { Config } from '../Config';
import { EnvName } from '../EnvName';
import { AuthConfig, OidcConfig, SamlConfig } from '../../types/Configuration';

// Configure SAML XML schema validator (required by samlify for security)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const samlifyValidator = require('@authenio/samlify-xsd-schema-validator');
samlify.setSchemaValidator(samlifyValidator);

const TAG = '[AuthService]';

export type AuthUser = {
    id: string;
    displayName: string;
    email?: string;
    username?: string;
};

type OidcSessionState = {
    codeVerifier?: string;
    state?: string;
    nonce?: string;
};

type SamlSessionState = {
    relayState?: string;
};

type AuthSessionState = {
    user?: AuthUser;
    idToken?: string;
};

export type AuthSession = Session & {
    oidc?: OidcSessionState;
    saml?: SamlSessionState;
    auth?: AuthSessionState;
};

export type AuthProvider = 'oidc' | 'saml' | null;

export class AuthService {
    private static instance?: AuthService;
    private sessionMiddleware?: ReturnType<typeof session>;
    private client?: Client;
    private oidcConfig?: OidcConfig;
    private samlConfig?: SamlConfig;
    private identityProvider?: samlify.IdentityProviderInstance;
    private serviceProvider?: samlify.ServiceProviderInstance;
    private authProvider: AuthProvider = null;
    private requireAuth = false;
    private enabled = false;
    private samlDebug = false;

    protected constructor() {
        // nothing here
    }

    public static getInstance(): AuthService {
        if (!this.instance) {
            this.instance = new AuthService();
        }
        return this.instance;
    }

    private logSaml(message: string, data?: unknown): void {
        if (!this.samlDebug) {
            return;
        }
        if (data !== undefined) {
            console.log(`${TAG} [SAML DEBUG] ${message}`, data);
        } else {
            console.log(`${TAG} [SAML DEBUG] ${message}`);
        }
    }

    public isEnabled(): boolean {
        return this.enabled;
    }

    public isAuthRequired(): boolean {
        return this.requireAuth;
    }

    public getClient(): Client | undefined {
        return this.client;
    }

    public getOidcConfig(): OidcConfig | undefined {
        return this.oidcConfig;
    }

    public getSamlConfig(): SamlConfig | undefined {
        return this.samlConfig;
    }

    public getAuthProvider(): AuthProvider {
        return this.authProvider;
    }

    public getSessionMiddleware(): ReturnType<typeof session> | undefined {
        return this.sessionMiddleware;
    }

    public async start(): Promise<void> {
        if (this.enabled) {
            return;
        }
        const config = Config.getInstance();
        const authConfig: AuthConfig | undefined = config.auth;
        const samlConfig = authConfig?.saml;
        const oidcConfig = authConfig?.oidc;

        // SAML takes priority over OIDC if both configured
        if (samlConfig) {
            await this.initializeSaml(samlConfig);
        } else if (oidcConfig) {
            await this.initializeOidc(oidcConfig);
        }
    }

    private async initializeOidc(oidcConfig: OidcConfig): Promise<void> {
        if (!oidcConfig.sessionSecret) {
            throw Error('OIDC requires auth.oidc.sessionSecret');
        }
        this.oidcConfig = oidcConfig;
        this.requireAuth = oidcConfig.requireAuth === true;
        this.authProvider = 'oidc';
        const sessionOptions: SessionOptions = {
            secret: oidcConfig.sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: (oidcConfig.sessionTtlSeconds || 86400) * 1000,
                httpOnly: true,
                sameSite: 'lax',
                secure: oidcConfig.cookieSecure === true,
            },
        };
        this.sessionMiddleware = session(sessionOptions);

        const issuer = await Issuer.discover(oidcConfig.issuerUrl);
        this.client = new issuer.Client({
            client_id: oidcConfig.clientId,
            client_secret: oidcConfig.clientSecret,
            redirect_uris: [oidcConfig.redirectUri],
            response_types: ['code'],
        });
        this.enabled = true;
    }

    private async initializeSaml(samlConfig: SamlConfig): Promise<void> {
        if (!samlConfig.sessionSecret) {
            throw Error('SAML requires auth.saml.sessionSecret');
        }
        if (!samlConfig.entryPoint) {
            throw Error('SAML requires auth.saml.entryPoint');
        }
        if (!samlConfig.issuer) {
            throw Error('SAML requires auth.saml.issuer');
        }
        if (!samlConfig.cert) {
            throw Error('SAML requires auth.saml.cert');
        }
        if (!samlConfig.callbackUrl) {
            throw Error('SAML requires auth.saml.callbackUrl');
        }

        this.samlConfig = samlConfig;
        this.samlDebug = samlConfig.debug === true;
        this.requireAuth = samlConfig.requireAuth === true;
        this.authProvider = 'saml';

        this.logSaml('Initializing SAML authentication');
        this.logSaml('Configuration:', {
            entryPoint: samlConfig.entryPoint,
            issuer: samlConfig.issuer,
            callbackUrl: samlConfig.callbackUrl,
            requireAuth: samlConfig.requireAuth,
            certLength: samlConfig.cert?.length || 0,
            certPreview: samlConfig.cert?.substring(0, 50) + '...',
        });

        const sessionOptions: SessionOptions = {
            secret: samlConfig.sessionSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                maxAge: (samlConfig.sessionTtlSeconds || 86400) * 1000,
                httpOnly: true,
                sameSite: 'lax',
                secure: samlConfig.cookieSecure === true,
            },
        };
        this.sessionMiddleware = session(sessionOptions);

        const idpEntityId = samlConfig.idpIssuer || samlConfig.entryPoint;
        this.logSaml('Creating Identity Provider with SSO URL:', samlConfig.entryPoint);
        this.logSaml('IdP Entity ID:', idpEntityId);
        this.identityProvider = samlify.IdentityProvider({
            metadata: undefined,
            entityID: idpEntityId,
            singleSignOnService: [
                {
                    Binding: samlify.Constants.namespace.binding.redirect,
                    Location: samlConfig.entryPoint,
                },
            ],
            signingCert: samlConfig.cert,
        });

        this.logSaml('Creating Service Provider with Entity ID:', samlConfig.issuer);
        this.serviceProvider = samlify.ServiceProvider({
            entityID: samlConfig.issuer,
            assertionConsumerService: [
                {
                    Binding: samlify.Constants.namespace.binding.post,
                    Location: samlConfig.callbackUrl,
                },
            ],
        });

        this.logSaml('SAML initialization complete');
        if (this.samlDebug) {
            console.log(`${TAG} [SAML DEBUG] ⚠️  Debug mode is ON - disable in production!`);
        }

        this.enabled = true;
    }

    public buildAuthorizationUrl(req: { session?: AuthSession }): string {
        if (this.authProvider === 'saml') {
            return this.buildSamlLoginUrl(req);
        }
        return this.buildOidcAuthorizationUrl(req);
    }

    private buildOidcAuthorizationUrl(req: { session?: AuthSession }): string {
        if (!this.client || !this.oidcConfig) {
            throw Error('OIDC is not configured');
        }
        const codeVerifier = generators.codeVerifier();
        const state = generators.state();
        const nonce = generators.nonce();
        const codeChallenge = generators.codeChallenge(codeVerifier);
        if (req.session) {
            req.session.oidc = { codeVerifier, state, nonce };
        }
        const scopes = this.oidcConfig.scopes?.length ? this.oidcConfig.scopes.join(' ') : 'openid profile email';
        return this.client.authorizationUrl({
            scope: scopes,
            state,
            nonce,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            redirect_uri: this.oidcConfig.redirectUri,
        });
    }

    private buildSamlLoginUrl(req: { session?: AuthSession }): string {
        if (!this.serviceProvider || !this.identityProvider) {
            throw Error('SAML is not configured');
        }
        const relayState = generators.state();
        if (req.session) {
            req.session.saml = { relayState };
        }
        this.logSaml('Building SAML login request with relayState:', relayState);

        const { context } = this.serviceProvider.createLoginRequest(this.identityProvider, 'redirect');
        this.logSaml('Generated SAML login URL:', context);

        return context;
    }

    public async handleCallback(req: { session?: AuthSession; url?: string }): Promise<AuthUser> {
        if (this.authProvider === 'oidc') {
            return this.handleOidcCallback(req);
        }
        throw Error('Use handleSamlCallback for SAML authentication');
    }

    private async handleOidcCallback(req: { session?: AuthSession; url?: string }): Promise<AuthUser> {
        if (!this.client || !this.oidcConfig) {
            throw Error('OIDC is not configured');
        }
        const sessionState = req.session?.oidc;
        if (!sessionState?.state || !sessionState.codeVerifier || !sessionState.nonce) {
            throw Error('Missing OIDC session state');
        }
        const params = this.client.callbackParams(req as unknown as http.IncomingMessage);
        const tokenSet = await this.client.callback(this.oidcConfig.redirectUri, params, {
            state: sessionState.state,
            nonce: sessionState.nonce,
            code_verifier: sessionState.codeVerifier,
        });
        const claims = tokenSet.claims();
        const displayName =
            claims.name || claims.preferred_username || claims.email || (claims.sub as string) || 'Unknown';
        const user: AuthUser = {
            id: claims.sub as string,
            displayName,
            email: claims.email as string | undefined,
            username: claims.preferred_username as string | undefined,
        };
        if (req.session) {
            req.session.auth = {
                user,
                idToken: tokenSet.id_token,
            };
            req.session.oidc = undefined;
        }
        return user;
    }

    public async handleSamlCallback(req: {
        session?: AuthSession;
        body?: { SAMLResponse?: string };
    }): Promise<AuthUser> {
        this.logSaml('=== SAML Callback Started ===');

        if (!this.serviceProvider || !this.identityProvider) {
            this.logSaml('ERROR: SAML not configured');
            throw Error('SAML is not configured');
        }

        const samlResponse = req.body?.SAMLResponse;
        if (!samlResponse) {
            this.logSaml('ERROR: No SAMLResponse in request body');
            this.logSaml('Request body keys:', Object.keys(req.body || {}));
            throw Error('Missing SAMLResponse in request body');
        }

        this.logSaml('SAMLResponse received, length:', samlResponse.length);
        this.logSaml('SAMLResponse preview (first 200 chars):', samlResponse.substring(0, 200));

        // Decode and log the SAML response for debugging
        if (this.samlDebug) {
            try {
                const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');
                this.logSaml('Decoded SAML Response XML (first 2000 chars):', decoded.substring(0, 2000));
            } catch (e) {
                this.logSaml('Could not decode SAMLResponse as base64:', e);
            }
        }

        this.logSaml('Session state:', {
            hasSession: !!req.session,
            samlState: req.session?.saml,
        });

        let extract;
        try {
            this.logSaml('Parsing SAML login response...');
            const result = await this.serviceProvider.parseLoginResponse(this.identityProvider, 'post', {
                body: { SAMLResponse: samlResponse },
            });
            extract = result.extract;
            this.logSaml('SAML response parsed successfully');
            this.logSaml('Full extract object:', JSON.stringify(extract, null, 2));
        } catch (error) {
            const err = error as Error;
            const errorMessage = err?.message || String(error);

            this.logSaml('ERROR: Failed to parse SAML response');
            this.logSaml('Error type:', err?.constructor?.name || 'Unknown');
            this.logSaml('Error message:', errorMessage);
            this.logSaml('Error stack:', err?.stack || 'No stack trace');

            // Try to provide more context
            if (errorMessage && errorMessage.includes('signature')) {
                this.logSaml('HINT: This may be a signature verification issue. Check that:');
                this.logSaml('  1. The IdP certificate is correct and complete');
                this.logSaml('  2. The certificate includes BEGIN/END markers');
                this.logSaml('  3. The IdP is signing responses with the expected certificate');
            }
            if (errorMessage && errorMessage.includes('audience')) {
                this.logSaml('HINT: This may be an audience restriction issue. Check that:');
                this.logSaml('  1. The issuer/entityID matches what the IdP expects');
                this.logSaml('  2. Current issuer configured:', this.samlConfig?.issuer);
            }

            throw error;
        }

        const attributes = extract.attributes || {};
        const nameID = extract.nameID || '';

        this.logSaml('Extracted NameID:', nameID);
        this.logSaml('Extracted attributes:', JSON.stringify(attributes, null, 2));
        this.logSaml('Attribute keys:', Object.keys(attributes));

        const displayName =
            (attributes['displayName'] as string) ||
            (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] as string) ||
            (attributes['name'] as string) ||
            (attributes['email'] as string) ||
            (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] as string) ||
            nameID ||
            'Unknown';
        const email =
            (attributes['email'] as string) ||
            (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] as string);
        const username =
            (attributes['username'] as string) ||
            (attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'] as string) ||
            (attributes['http://schemas.microsoft.com/identity/claims/objectidentifier'] as string);

        const user: AuthUser = {
            id: nameID || (attributes['sub'] as string) || 'unknown',
            displayName,
            email,
            username,
        };

        this.logSaml('Constructed user object:', user);

        if (req.session) {
            req.session.auth = { user };
            req.session.saml = undefined;
            this.logSaml('User stored in session');
        }

        this.logSaml('=== SAML Callback Completed Successfully ===');
        return user;
    }

    public getUserFromRequest(request: http.IncomingMessage): Promise<AuthUser | undefined> {
        const middleware = this.sessionMiddleware;
        if (!this.enabled || !middleware) {
            return Promise.resolve(undefined);
        }
        return new Promise<AuthUser | undefined>((resolve) => {
            const res = {
                getHeader: () => undefined,
                setHeader: () => undefined,
                end: () => undefined,
            } as unknown as Response;
            middleware(request as unknown as Request, res, () => {
                const session = (request as unknown as { session?: AuthSession }).session;
                resolve(session?.auth?.user);
            });
        });
    }

    public isAuthenticated(request: { session?: AuthSession }): boolean {
        return !!request.session?.auth?.user;
    }

    public getPostLoginRedirect(): string {
        const pathname = process.env[EnvName.WS_SCRCPY_PATHNAME] || __PATHNAME__ || '/';
        return pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
    }
}
