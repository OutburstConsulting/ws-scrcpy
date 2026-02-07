import * as https from 'https';

export type OperatingSystem = 'android' | 'ios';

export interface HostItem {
    type: OperatingSystem;
    secure: boolean;
    hostname: string;
    port: number;
    pathname?: string;
    useProxy?: boolean;
}

export interface HostsItem {
    type: OperatingSystem | OperatingSystem[];
    secure: boolean;
    hostname: string;
    port: number;
    pathname?: string;
    useProxy?: boolean;
}

export type ExtendedServerOption = https.ServerOptions & {
    certPath?: string;
    keyPath?: string;
};

export interface ServerItem {
    secure: boolean;
    port: number;
    options?: ExtendedServerOption;
    redirectToSecure?:
        | {
              port?: number;
              host?: string;
          }
        | boolean;
}

export interface OidcConfig {
    issuerUrl: string;
    clientId: string;
    clientSecret?: string;
    redirectUri: string;
    scopes?: string[];
    requireAuth?: boolean;
    sessionSecret: string;
    sessionTtlSeconds?: number;
    cookieSecure?: boolean;
}

export interface SamlConfig {
    entryPoint: string;
    issuer: string; // SP entity ID (this application)
    idpIssuer?: string; // IdP entity ID (e.g., https://authentik.example.com)
    cert: string;
    callbackUrl: string;
    requireAuth?: boolean;
    sessionSecret: string;
    sessionTtlSeconds?: number;
    cookieSecure?: boolean;
    debug?: boolean; // Enable detailed SAML logging for troubleshooting
}

export interface AuthConfig {
    oidc?: OidcConfig;
    saml?: SamlConfig;
}

// The configuration file must contain a single object with this structure
export interface Configuration {
    server?: ServerItem[];
    runApplTracker?: boolean;
    announceApplTracker?: boolean;
    runGoogTracker?: boolean;
    announceGoogTracker?: boolean;
    remoteHostList?: HostsItem[];
    auth?: AuthConfig;
}
