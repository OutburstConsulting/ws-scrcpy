import { EventEmitter } from 'events';
import { Service } from '../../services/Service';

export interface SessionCountChangedEvent {
    udid: string;
    displayId: number;
    count: number;
}

export class SessionTracker extends EventEmitter implements Service {
    private static instance?: SessionTracker;

    // Map: udid -> displayId -> Set<clientId>
    private sessions: Map<string, Map<number, Set<string>>> = new Map();
    private clientIdCounter = 0;

    protected constructor() {
        super();
    }

    public static getInstance(): SessionTracker {
        if (!this.instance) {
            this.instance = new SessionTracker();
        }
        return this.instance;
    }

    public static hasInstance(): boolean {
        return !!SessionTracker.instance;
    }

    public generateClientId(): string {
        return `client_${++this.clientIdCounter}_${Date.now()}`;
    }

    public addSession(udid: string, displayId: number, clientId: string): void {
        if (!this.sessions.has(udid)) {
            this.sessions.set(udid, new Map());
        }
        const deviceMap = this.sessions.get(udid)!;
        if (!deviceMap.has(displayId)) {
            deviceMap.set(displayId, new Set());
        }
        const clients = deviceMap.get(displayId)!;
        clients.add(clientId);

        const count = clients.size;
        this.emit('sessionCountChanged', { udid, displayId, count } as SessionCountChangedEvent);
    }

    public removeSession(udid: string, displayId: number, clientId: string): void {
        const deviceMap = this.sessions.get(udid);
        if (!deviceMap) {
            return;
        }
        const clients = deviceMap.get(displayId);
        if (!clients) {
            return;
        }
        clients.delete(clientId);

        const count = clients.size;
        this.emit('sessionCountChanged', { udid, displayId, count } as SessionCountChangedEvent);

        // Cleanup empty sets and maps
        if (clients.size === 0) {
            deviceMap.delete(displayId);
        }
        if (deviceMap.size === 0) {
            this.sessions.delete(udid);
        }
    }

    public getSessionCount(udid: string, displayId: number): number {
        const deviceMap = this.sessions.get(udid);
        if (!deviceMap) {
            return 0;
        }
        const clients = deviceMap.get(displayId);
        if (!clients) {
            return 0;
        }
        return clients.size;
    }

    public getName(): string {
        return 'SessionTracker';
    }

    public start(): Promise<void> {
        return Promise.resolve();
    }

    public release(): void {
        this.sessions.clear();
        this.removeAllListeners();
    }
}
