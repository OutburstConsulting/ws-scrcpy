import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Service } from './Service';

export interface SavedConnection {
    id: string;
    name: string;
    hostname: string;
    port: number;
    secure: boolean;
    type: 'android' | 'ios';
    createdAt: number;
}

export class ConnectionDatabase implements Service {
    private static instance: ConnectionDatabase;
    private db: Database.Database | null = null;
    private readonly dbPath: string;

    private constructor() {
        // Store database in a data directory next to the dist folder
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.dbPath = path.join(dataDir, 'connections.db');
    }

    public static getInstance(): ConnectionDatabase {
        if (!ConnectionDatabase.instance) {
            ConnectionDatabase.instance = new ConnectionDatabase();
        }
        return ConnectionDatabase.instance;
    }

    public static hasInstance(): boolean {
        return !!ConnectionDatabase.instance;
    }

    public getName(): string {
        return 'ConnectionDatabase';
    }

    public async start(): Promise<void> {
        this.db = new Database(this.dbPath);
        this.initializeSchema();
        console.log(`[${this.getName()}] Database initialized at ${this.dbPath}`);
    }

    public release(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }

    private initializeSchema(): void {
        if (!this.db) return;

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                hostname TEXT NOT NULL,
                port INTEGER NOT NULL,
                secure INTEGER NOT NULL DEFAULT 0,
                type TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);
    }

    public getAllConnections(): SavedConnection[] {
        if (!this.db) return [];

        const stmt = this.db.prepare(`
            SELECT id, name, hostname, port, secure, type, created_at
            FROM connections
            ORDER BY created_at DESC
        `);

        const rows = stmt.all() as Array<{
            id: string;
            name: string;
            hostname: string;
            port: number;
            secure: number;
            type: string;
            created_at: number;
        }>;

        return rows.map((row) => ({
            id: row.id,
            name: row.name,
            hostname: row.hostname,
            port: row.port,
            secure: row.secure === 1,
            type: row.type as 'android' | 'ios',
            createdAt: row.created_at,
        }));
    }

    public getConnectionById(id: string): SavedConnection | null {
        if (!this.db) return null;

        const stmt = this.db.prepare(`
            SELECT id, name, hostname, port, secure, type, created_at
            FROM connections
            WHERE id = ?
        `);

        const row = stmt.get(id) as
            | {
                  id: string;
                  name: string;
                  hostname: string;
                  port: number;
                  secure: number;
                  type: string;
                  created_at: number;
              }
            | undefined;

        if (!row) return null;

        return {
            id: row.id,
            name: row.name,
            hostname: row.hostname,
            port: row.port,
            secure: row.secure === 1,
            type: row.type as 'android' | 'ios',
            createdAt: row.created_at,
        };
    }

    public saveConnection(connection: SavedConnection): void {
        if (!this.db) return;

        const stmt = this.db.prepare(`
            INSERT INTO connections (id, name, hostname, port, secure, type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                hostname = excluded.hostname,
                port = excluded.port,
                secure = excluded.secure,
                type = excluded.type
        `);

        stmt.run(
            connection.id,
            connection.name,
            connection.hostname,
            connection.port,
            connection.secure ? 1 : 0,
            connection.type,
            connection.createdAt,
        );
    }

    public deleteConnection(id: string): boolean {
        if (!this.db) return false;

        const stmt = this.db.prepare('DELETE FROM connections WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }
}
