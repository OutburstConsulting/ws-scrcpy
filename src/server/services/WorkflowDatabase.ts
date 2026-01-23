import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Service } from './Service';

export interface WorkflowAction {
    type: string;
    timestamp: number;
    [key: string]: unknown;
}

export interface Workflow {
    id: string;
    deviceId: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    screenSize: { width: number; height: number };
    actions: WorkflowAction[];
}

export class WorkflowDatabase implements Service {
    private static instance: WorkflowDatabase;
    private db: Database.Database | null = null;
    private readonly dbPath: string;

    private constructor() {
        // Store database in a data directory next to the dist folder
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.dbPath = path.join(dataDir, 'workflows.db');
    }

    public static getInstance(): WorkflowDatabase {
        if (!WorkflowDatabase.instance) {
            WorkflowDatabase.instance = new WorkflowDatabase();
        }
        return WorkflowDatabase.instance;
    }

    public static hasInstance(): boolean {
        return !!WorkflowDatabase.instance;
    }

    public getName(): string {
        return 'WorkflowDatabase';
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
            CREATE TABLE IF NOT EXISTS workflows (
                id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL DEFAULT '',
                name TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                screen_width INTEGER NOT NULL,
                screen_height INTEGER NOT NULL,
                actions TEXT NOT NULL
            )
        `);

        const columns = this.db
            .prepare(`PRAGMA table_info('workflows')`)
            .all() as Array<{ name: string }>;
        const hasDeviceId = columns.some((column) => column.name === 'device_id');
        if (!hasDeviceId) {
            this.db.exec(`ALTER TABLE workflows ADD COLUMN device_id TEXT NOT NULL DEFAULT ''`);
        }
    }

    public getAllWorkflows(deviceId: string): Workflow[] {
        if (!this.db) return [];

        const stmt = this.db.prepare(`
            SELECT id, device_id, name, description, created_at, updated_at, screen_width, screen_height, actions
            FROM workflows
            WHERE device_id = ?
            ORDER BY updated_at DESC
        `);

        const rows = stmt.all(deviceId) as Array<{
            id: string;
            device_id: string;
            name: string;
            description: string | null;
            created_at: number;
            updated_at: number;
            screen_width: number;
            screen_height: number;
            actions: string;
        }>;

        return rows.map((row) => ({
            id: row.id,
            deviceId: row.device_id,
            name: row.name,
            description: row.description || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            screenSize: { width: row.screen_width, height: row.screen_height },
            actions: JSON.parse(row.actions),
        }));
    }

    public getWorkflowById(id: string, deviceId: string): Workflow | null {
        if (!this.db) return null;

        const stmt = this.db.prepare(`
            SELECT id, device_id, name, description, created_at, updated_at, screen_width, screen_height, actions
            FROM workflows
            WHERE id = ? AND device_id = ?
        `);

        const row = stmt.get(id, deviceId) as
            | {
                  id: string;
                  device_id: string;
                  name: string;
                  description: string | null;
                  created_at: number;
                  updated_at: number;
                  screen_width: number;
                  screen_height: number;
                  actions: string;
              }
            | undefined;

        if (!row) return null;

        return {
            id: row.id,
            deviceId: row.device_id,
            name: row.name,
            description: row.description || undefined,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            screenSize: { width: row.screen_width, height: row.screen_height },
            actions: JSON.parse(row.actions),
        };
    }

    public saveWorkflow(workflow: Workflow): void {
        if (!this.db) return;

        const stmt = this.db.prepare(`
            INSERT INTO workflows (
                id,
                device_id,
                name,
                description,
                created_at,
                updated_at,
                screen_width,
                screen_height,
                actions
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                device_id = excluded.device_id,
                name = excluded.name,
                description = excluded.description,
                updated_at = excluded.updated_at,
                screen_width = excluded.screen_width,
                screen_height = excluded.screen_height,
                actions = excluded.actions
        `);

        stmt.run(
            workflow.id,
            workflow.deviceId,
            workflow.name,
            workflow.description || null,
            workflow.createdAt,
            workflow.updatedAt,
            workflow.screenSize.width,
            workflow.screenSize.height,
            JSON.stringify(workflow.actions),
        );
    }

    public deleteWorkflow(id: string, deviceId: string): boolean {
        if (!this.db) return false;

        const stmt = this.db.prepare('DELETE FROM workflows WHERE id = ? AND device_id = ?');
        const result = stmt.run(id, deviceId);
        return result.changes > 0;
    }
}
