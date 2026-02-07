import { Router, Request, Response, urlencoded } from 'express';
import { AuthService, AuthSession } from '../services/AuthService';

const TAG = '[AuthApi]';

export class AuthApi {
    private router: Router;
    private authService: AuthService;

    constructor(authService?: AuthService) {
        this.router = Router();
        this.authService = authService || AuthService.getInstance();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        this.router.get('/login', (req: Request, res: Response) => {
            if (!this.authService.isEnabled()) {
                res.status(404).send('Auth disabled');
                return;
            }
            try {
                const url = this.authService.buildAuthorizationUrl(req as Request & { session?: AuthSession });
                res.redirect(url);
            } catch (error) {
                console.error(TAG, 'Login failed:', error);
                res.status(500).send('Failed to start login');
            }
        });

        this.router.get('/callback', async (req: Request, res: Response) => {
            if (!this.authService.isEnabled()) {
                res.status(404).send('Auth disabled');
                return;
            }
            if (this.authService.getAuthProvider() !== 'oidc') {
                res.status(404).send('OIDC not configured');
                return;
            }
            try {
                await this.authService.handleCallback(req as Request & { session?: AuthSession });
                res.redirect(this.authService.getPostLoginRedirect());
            } catch (error) {
                console.error(TAG, 'Callback failed:', error);
                res.status(500).send('Failed to complete login');
            }
        });

        this.router.post('/saml/callback', urlencoded({ extended: false }), async (req: Request, res: Response) => {
            if (!this.authService.isEnabled()) {
                res.status(404).send('Auth disabled');
                return;
            }
            if (this.authService.getAuthProvider() !== 'saml') {
                res.status(404).send('SAML not configured');
                return;
            }
            try {
                await this.authService.handleSamlCallback(
                    req as Request & { session?: AuthSession; body?: { SAMLResponse?: string } },
                );
                res.redirect(this.authService.getPostLoginRedirect());
            } catch (error) {
                console.error(TAG, 'SAML callback failed:', error);

                // Handle various error types (Error object, string, object with message, etc.)
                let errorMessage = 'Unknown error';
                let errorStack = 'No stack trace available';
                let errorDetails = '';

                if (error instanceof Error) {
                    errorMessage = error.message || 'Unknown error';
                    errorStack = error.stack || 'No stack trace available';
                } else if (typeof error === 'string') {
                    errorMessage = error;
                } else if (error && typeof error === 'object') {
                    // samlify sometimes throws objects with specific properties
                    const errObj = error as Record<string, unknown>;
                    errorMessage = String(errObj.message || errObj.error || errObj.toString());
                    errorDetails = JSON.stringify(error, null, 2);
                } else {
                    errorMessage = String(error);
                }

                const errorHtml = `
                    <html>
                    <head><title>SAML Login Failed</title></head>
                    <body style="font-family: monospace; padding: 20px; background: #1a1a1a; color: #f0f0f0;">
                        <h1 style="color: #ff6b6b;">SAML Login Failed</h1>
                        <h2 style="color: #ffa94d;">Error: ${errorMessage}</h2>
                        <h3>Stack Trace:</h3>
                        <pre style="background: #2d2d2d; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap;">${errorStack}</pre>
                        ${errorDetails ? `<h3>Error Details:</h3><pre style="background: #2d2d2d; padding: 15px; border-radius: 5px; overflow-x: auto; white-space: pre-wrap;">${errorDetails}</pre>` : ''}
                        <p style="margin-top: 20px;"><a href="/auth/login" style="color: #69db7c;">Try again</a></p>
                    </body>
                    </html>
                `;
                res.status(500).send(errorHtml);
            }
        });

        this.router.post('/logout', (req: Request, res: Response) => {
            if (!this.authService.isEnabled()) {
                res.status(404).send('Auth disabled');
                return;
            }
            const session = req.session as AuthSession | undefined;
            if (session) {
                session.auth = undefined;
                session.oidc = undefined;
                session.saml = undefined;
            }
            res.json({ success: true });
        });

        this.router.get('/me', (req: Request, res: Response) => {
            if (!this.authService.isEnabled()) {
                res.json({ authenticated: false });
                return;
            }
            const session = req.session as AuthSession | undefined;
            const user = session?.auth?.user;
            if (!user) {
                res.json({ authenticated: false });
                return;
            }
            res.json({ authenticated: true, user });
        });
    }

    public getRouter(): Router {
        return this.router;
    }
}
