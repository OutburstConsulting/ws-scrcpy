import { EventEmitter } from 'events';
import { Service } from '../../services/Service';

export interface SessionCountChangedEvent {
    udid: string;
    displayId: number;
    count: number;
    viewers: SessionViewer[];
}

export interface SessionViewer {
    id: string;
    displayName: string;
    email?: string;
    username?: string;
}

export class SessionTracker extends EventEmitter implements Service {
    private static instance?: SessionTracker;

    // Map: udid -> displayId -> Map<clientId, SessionViewer>
    private sessions: Map<string, Map<number, Map<string, SessionViewer>>> = new Map();
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

    public addSession(udid: string, displayId: number, clientId: string, viewer?: SessionViewer): void {
        if (!this.sessions.has(udid)) {
            this.sessions.set(udid, new Map());
        }
        const deviceMap = this.sessions.get(udid)!;
        if (!deviceMap.has(displayId)) {
            deviceMap.set(displayId, new Map());
        }
        const clients = deviceMap.get(displayId)!;
        clients.set(clientId, viewer || this.createAnonymousViewer(clientId));

        const count = clients.size;
        const viewers = this.getSessionViewers(udid, displayId);
        this.emit('sessionCountChanged', { udid, displayId, count, viewers } as SessionCountChangedEvent);
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
        const viewers = this.getSessionViewers(udid, displayId);
        this.emit('sessionCountChanged', { udid, displayId, count, viewers } as SessionCountChangedEvent);

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

    public getSessionViewers(udid: string, displayId: number): SessionViewer[] {
        const deviceMap = this.sessions.get(udid);
        if (!deviceMap) {
            return [];
        }
        const clients = deviceMap.get(displayId);
        if (!clients) {
            return [];
        }
        const uniqueViewers = new Map<string, SessionViewer>();
        for (const viewer of clients.values()) {
            const viewerId = viewer.id || viewer.displayName || '';
            if (!viewerId) {
                continue;
            }
            if (!uniqueViewers.has(viewerId)) {
                uniqueViewers.set(viewerId, viewer);
            }
        }
        return Array.from(uniqueViewers.values()).sort((a, b) => a.displayName.localeCompare(b.displayName));
    }

    private createAnonymousViewer(clientId: string): SessionViewer {
        return {
            id: clientId,
            displayName: 'Anonymous',
        };
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
