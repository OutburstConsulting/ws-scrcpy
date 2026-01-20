import { Router, Request, Response } from 'express';
import { ConnectionDatabase, SavedConnection } from '../services/ConnectionDatabase';

export class ConnectionApi {
    private router: Router;

    constructor() {
        this.router = Router();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        // GET /api/connections - Get all connections
        this.router.get('/', (_req: Request, res: Response) => {
            try {
                const db = ConnectionDatabase.getInstance();
                const connections = db.getAllConnections();
                res.json({ success: true, connections });
            } catch (error) {
                console.error('[ConnectionApi] Error getting connections:', error);
                res.status(500).json({ success: false, error: 'Failed to get connections' });
            }
        });

        // GET /api/connections/:id - Get a specific connection
        this.router.get('/:id', (req: Request, res: Response) => {
            try {
                const db = ConnectionDatabase.getInstance();
                const connection = db.getConnectionById(req.params.id);
                if (connection) {
                    res.json({ success: true, connection });
                } else {
                    res.status(404).json({ success: false, error: 'Connection not found' });
                }
            } catch (error) {
                console.error('[ConnectionApi] Error getting connection:', error);
                res.status(500).json({ success: false, error: 'Failed to get connection' });
            }
        });

        // POST /api/connections - Create or update a connection
        this.router.post('/', (req: Request, res: Response) => {
            try {
                const connection = req.body as SavedConnection;
                if (!connection.id || !connection.name || !connection.hostname || !connection.port) {
                    res.status(400).json({ success: false, error: 'Invalid connection data' });
                    return;
                }

                const db = ConnectionDatabase.getInstance();
                db.saveConnection(connection);
                res.json({ success: true, connection });
            } catch (error) {
                console.error('[ConnectionApi] Error saving connection:', error);
                res.status(500).json({ success: false, error: 'Failed to save connection' });
            }
        });

        // DELETE /api/connections/:id - Delete a connection
        this.router.delete('/:id', (req: Request, res: Response) => {
            try {
                const db = ConnectionDatabase.getInstance();
                const deleted = db.deleteConnection(req.params.id);
                if (deleted) {
                    res.json({ success: true });
                } else {
                    res.status(404).json({ success: false, error: 'Connection not found' });
                }
            } catch (error) {
                console.error('[ConnectionApi] Error deleting connection:', error);
                res.status(500).json({ success: false, error: 'Failed to delete connection' });
            }
        });
    }

    public getRouter(): Router {
        return this.router;
    }
}
