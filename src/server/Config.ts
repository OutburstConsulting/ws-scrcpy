import * as process from 'process';
import * as fs from 'fs';
import * as path from 'path';
import { AuthConfig, Configuration, HostItem, OidcConfig, SamlConfig, ServerItem } from '../types/Configuration';
import { EnvName } from './EnvName';
import YAML from 'yaml';

const DEFAULT_PORT = 8000;

const YAML_RE = /^.+\.(yaml|yml)$/i;
const JSON_RE = /^.+\.(json|js)$/i;

export class Config {
    private static instance?: Config;
    private static initConfig(userConfig: Configuration = {}): Required<Configuration> {
        let runGoogTracker = false;
        let announceGoogTracker = false;
        /// #if INCLUDE_GOOG
        runGoogTracker = true;
        announceGoogTracker = true;
        /// #endif

        let runApplTracker = false;
        let announceApplTracker = false;
        /// #if INCLUDE_APPL
        runApplTracker = true;
        announceApplTracker = true;
        /// #endif
        const server: ServerItem[] = [
            {
                secure: false,
                port: DEFAULT_PORT,
            },
        ];
        const defaultConfig: Required<Configuration> = {
            runGoogTracker,
            runApplTracker,
            announceGoogTracker,
            announceApplTracker,
            server,
            remoteHostList: [],
            auth: {},
        };
        const merged = Object.assign({}, defaultConfig, userConfig);
        merged.server = merged.server.map((item) => this.parseServerItem(item));
        return merged;
    }
    private static parseBooleanEnv(value?: string): boolean | undefined {
        if (typeof value === 'undefined') {
            return undefined;
        }
        const normalized = value.trim().toLowerCase();
        if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
            return true;
        }
        if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
            return false;
        }
        return undefined;
    }
    private static parseNumberEnv(value?: string): number | undefined {
        if (typeof value === 'undefined') {
            return undefined;
        }
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return undefined;
        }
        return parsed;
    }
    private static parseScopesEnv(value?: string): string[] | undefined {
        if (typeof value === 'undefined') {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed) {
            return undefined;
        }
        const parts = trimmed.includes(',') ? trimmed.split(',') : trimmed.split(/\s+/);
        const scopes = parts.map((item) => item.trim()).filter(Boolean);
        return scopes.length ? scopes : undefined;
    }
    private static readAuthFromEnv(): AuthConfig | undefined {
        const oidcConfig: Partial<OidcConfig> = {};
        const issuerUrl = process.env[EnvName.OIDC_ISSUER_URL];
        const clientId = process.env[EnvName.OIDC_CLIENT_ID];
        const clientSecret = process.env[EnvName.OIDC_CLIENT_SECRET];
        const redirectUri = process.env[EnvName.OIDC_REDIRECT_URI];
        const scopes = this.parseScopesEnv(process.env[EnvName.OIDC_SCOPES]);
        const requireAuth = this.parseBooleanEnv(process.env[EnvName.OIDC_REQUIRE_AUTH]);
        const sessionSecret = process.env[EnvName.OIDC_SESSION_SECRET];
        const sessionTtlSeconds = this.parseNumberEnv(process.env[EnvName.OIDC_SESSION_TTL_SECONDS]);
        const cookieSecure = this.parseBooleanEnv(process.env[EnvName.OIDC_COOKIE_SECURE]);

        if (issuerUrl) {
            oidcConfig.issuerUrl = issuerUrl;
        }
        if (clientId) {
            oidcConfig.clientId = clientId;
        }
        if (clientSecret) {
            oidcConfig.clientSecret = clientSecret;
        }
        if (redirectUri) {
            oidcConfig.redirectUri = redirectUri;
        }
        if (scopes) {
            oidcConfig.scopes = scopes;
        }
        if (typeof requireAuth !== 'undefined') {
            oidcConfig.requireAuth = requireAuth;
        }
        if (sessionSecret) {
            oidcConfig.sessionSecret = sessionSecret;
        }
        if (typeof sessionTtlSeconds !== 'undefined') {
            oidcConfig.sessionTtlSeconds = sessionTtlSeconds;
        }
        if (typeof cookieSecure !== 'undefined') {
            oidcConfig.cookieSecure = cookieSecure;
        }

        if (!Object.keys(oidcConfig).length) {
            return undefined;
        }

        return { oidc: oidcConfig as OidcConfig };
    }
    private static readSamlFromEnv(): AuthConfig | undefined {
        const samlConfig: Partial<SamlConfig> = {};
        const entryPoint = process.env[EnvName.SAML_ENTRY_POINT];
        const issuer = process.env[EnvName.SAML_ISSUER];
        const idpIssuer = process.env[EnvName.SAML_IDP_ISSUER];
        const cert = process.env[EnvName.SAML_CERT];
        const callbackUrl = process.env[EnvName.SAML_CALLBACK_URL];
        const requireAuth = this.parseBooleanEnv(process.env[EnvName.SAML_REQUIRE_AUTH]);
        const sessionSecret = process.env[EnvName.SAML_SESSION_SECRET];
        const sessionTtlSeconds = this.parseNumberEnv(process.env[EnvName.SAML_SESSION_TTL_SECONDS]);
        const cookieSecure = this.parseBooleanEnv(process.env[EnvName.SAML_COOKIE_SECURE]);
        const debug = this.parseBooleanEnv(process.env[EnvName.SAML_DEBUG]);

        if (entryPoint) {
            samlConfig.entryPoint = entryPoint;
        }
        if (issuer) {
            samlConfig.issuer = issuer;
        }
        if (idpIssuer) {
            samlConfig.idpIssuer = idpIssuer;
        }
        if (cert) {
            samlConfig.cert = cert;
        }
        if (callbackUrl) {
            samlConfig.callbackUrl = callbackUrl;
        }
        if (typeof requireAuth !== 'undefined') {
            samlConfig.requireAuth = requireAuth;
        }
        if (sessionSecret) {
            samlConfig.sessionSecret = sessionSecret;
        }
        if (typeof sessionTtlSeconds !== 'undefined') {
            samlConfig.sessionTtlSeconds = sessionTtlSeconds;
        }
        if (typeof cookieSecure !== 'undefined') {
            samlConfig.cookieSecure = cookieSecure;
        }
        if (typeof debug !== 'undefined') {
            samlConfig.debug = debug;
        }

        if (!Object.keys(samlConfig).length) {
            return undefined;
        }

        return { saml: samlConfig as SamlConfig };
    }
    private static mergeAuthConfig(base: AuthConfig, ...overrides: (AuthConfig | undefined)[]): AuthConfig {
        const merged: AuthConfig = { ...base };
        for (const override of overrides) {
            if (!override) {
                continue;
            }
            if (override.oidc) {
                merged.oidc = {
                    ...(merged.oidc || {}),
                    ...override.oidc,
                } as OidcConfig;
            }
            if (override.saml) {
                merged.saml = {
                    ...(merged.saml || {}),
                    ...override.saml,
                } as SamlConfig;
            }
        }
        return merged;
    }
    private static parseServerItem(config: Partial<ServerItem> = {}): ServerItem {
        const secure = config.secure || false;
        const port = config.port || (secure ? 443 : 80);
        const options = config.options;
        const redirectToSecure = config.redirectToSecure || false;
        if (secure && !options) {
            throw Error('Must provide "options" for secure server configuration');
        }
        if (options?.certPath) {
            if (options.cert) {
                throw Error(`Can't use "cert" and "certPath" together`);
            }
            options.cert = this.readFile(options.certPath);
        }
        if (options?.keyPath) {
            if (options.key) {
                throw Error(`Can't use "key" and "keyPath" together`);
            }
            options.key = this.readFile(options.keyPath);
        }
        const serverItem: ServerItem = {
            secure,
            port,
            redirectToSecure,
        };
        if (typeof options !== 'undefined') {
            serverItem.options = options;
        }
        if (typeof redirectToSecure === 'boolean') {
            serverItem.redirectToSecure = redirectToSecure;
        }
        return serverItem;
    }
    public static getInstance(): Config {
        if (!this.instance) {
            const configPath = process.env[EnvName.CONFIG_PATH];
            let userConfig: Configuration;
            if (!configPath) {
                userConfig = {};
            } else {
                if (configPath.match(YAML_RE)) {
                    userConfig = YAML.parse(this.readFile(configPath));
                } else if (configPath.match(JSON_RE)) {
                    userConfig = JSON.parse(this.readFile(configPath));
                } else {
                    throw Error(`Unknown file type: ${configPath}`);
                }
            }
            const fullConfig = this.initConfig(userConfig);
            fullConfig.auth = this.mergeAuthConfig(fullConfig.auth, this.readAuthFromEnv(), this.readSamlFromEnv());
            this.instance = new Config(fullConfig);
        }
        return this.instance;
    }

    public static readFile(pathString: string): string {
        const isAbsolute = pathString.startsWith('/');
        const absolutePath = isAbsolute ? pathString : path.resolve(process.cwd(), pathString);
        if (!fs.existsSync(absolutePath)) {
            throw Error(`Can't find file "${absolutePath}"`);
        }
        return fs.readFileSync(absolutePath).toString();
    }

    constructor(private fullConfig: Required<Configuration>) {}

    public getHostList(): HostItem[] {
        if (!this.fullConfig.remoteHostList || !this.fullConfig.remoteHostList.length) {
            return [];
        }
        const hostList: HostItem[] = [];
        this.fullConfig.remoteHostList.forEach((item) => {
            const { hostname, port, pathname, secure, useProxy } = item;
            if (Array.isArray(item.type)) {
                item.type.forEach((type) => {
                    hostList.push({
                        hostname,
                        port,
                        pathname,
                        secure,
                        useProxy,
                        type,
                    });
                });
            } else {
                hostList.push({ hostname, port, pathname, secure, useProxy, type: item.type });
            }
        });
        return hostList;
    }

    public get runLocalGoogTracker(): boolean {
        return this.fullConfig.runGoogTracker;
    }

    public get announceLocalGoogTracker(): boolean {
        return this.fullConfig.runGoogTracker;
    }

    public get runLocalApplTracker(): boolean {
        return this.fullConfig.runApplTracker;
    }

    public get announceLocalApplTracker(): boolean {
        return this.fullConfig.runApplTracker;
    }

    public get servers(): ServerItem[] {
        return this.fullConfig.server;
    }

    public get auth(): AuthConfig | undefined {
        return this.fullConfig.auth;
    }
}
