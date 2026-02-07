import { WebsocketProxy } from '../../mw/WebsocketProxy';
import { AdbUtils } from '../AdbUtils';
import WS from 'ws';
import { RequestParameters } from '../../mw/Mw';
import { ACTION } from '../../../common/Action';
import { SessionTracker, SessionCountChangedEvent, SessionViewer } from '../services/SessionTracker';
import { ScreenLockService, LockChangedEvent } from '../services/ScreenLockService';
import { LockRequestMessage, LockStateMessage } from '../../../types/ScreenLock';

export class WebsocketProxyOverAdb extends WebsocketProxy {
    private udid?: string;
    private displayId = 0;
    private clientId?: string;
    private sessionCountListener?: (event: SessionCountChangedEvent) => void;
    private lockChangeListener?: (event: LockChangedEvent) => void;
    private viewer?: SessionViewer;

    public static processRequest(ws: WS, params: RequestParameters): WebsocketProxy | undefined {
        const { action, url } = params;
        let udid: string | null = '';
        let remote: string | null = '';
        let path: string | null = '';
        let isSuitable = false;
        if (action === ACTION.PROXY_ADB) {
            isSuitable = true;
            remote = url.searchParams.get('remote');
            udid = url.searchParams.get('udid');
            path = url.searchParams.get('path');
        }
        if (url && url.pathname) {
            const temp = url.pathname.split('/');
            // Shortcut for action=proxy, without query string
            if (temp.length >= 4 && temp[0] === '' && temp[1] === ACTION.PROXY_ADB) {
                isSuitable = true;
                temp.splice(0, 2);
                udid = decodeURIComponent(temp.shift() || '');
                remote = decodeURIComponent(temp.shift() || '');
                path = temp.join('/') || '/';
            }
        }
        if (!isSuitable) {
            return;
        }
        if (typeof remote !== 'string' || !remote) {
            ws.close(4003, `[${this.TAG}] Invalid value "${remote}" for "remote" parameter`);
            return;
        }
        if (typeof udid !== 'string' || !udid) {
            ws.close(4003, `[${this.TAG}] Invalid value "${udid}" for "udid" parameter`);
            return;
        }
        if (path && typeof path !== 'string') {
            ws.close(4003, `[${this.TAG}] Invalid value "${path}" for "path" parameter`);
            return;
        }
        const viewer = params.user
            ? {
                  id: params.user.id,
                  displayName: params.user.displayName,
                  email: params.user.email,
                  username: params.user.username,
              }
            : undefined;
        return this.createProxyOverAdb(ws, udid, remote, path, viewer);
    }

    public static createProxyOverAdb(
        ws: WS,
        udid: string,
        remote: string,
        path?: string | null,
        viewer?: SessionViewer,
    ): WebsocketProxyOverAdb {
        const service = new WebsocketProxyOverAdb(ws, udid, viewer);
        AdbUtils.forward(udid, remote)
            .then((port) => {
                return service.init(`ws://127.0.0.1:${port}${path ? path : ''}`);
            })
            .then(() => {
                service.registerSession();
            })
            .catch((e) => {
                const msg = `[${this.TAG}] Failed to start service: ${e.message}`;
                console.error(msg);
                ws.close(4005, msg);
            });
        return service;
    }

    constructor(ws: WS, udid: string, viewer?: SessionViewer) {
        super(ws);
        this.udid = udid;
        this.viewer = viewer;
    }

    private registerSession(): void {
        if (!this.udid) {
            return;
        }
        const sessionTracker = SessionTracker.getInstance();
        const screenLockService = ScreenLockService.getInstance();

        this.clientId = sessionTracker.generateClientId();
        sessionTracker.addSession(this.udid, this.displayId, this.clientId, this.viewer);

        // Listen for session count changes for this device
        this.sessionCountListener = (event: SessionCountChangedEvent) => {
            if (event.udid === this.udid && event.displayId === this.displayId) {
                this.sendSessionCount(event.count, event.viewers);
            }
        };
        sessionTracker.on('sessionCountChanged', this.sessionCountListener);

        // Listen for lock changes for this device
        this.lockChangeListener = (event: LockChangedEvent) => {
            if (event.udid === this.udid && event.displayId === this.displayId) {
                this.sendLockState();
            }
        };
        screenLockService.on('lockChanged', this.lockChangeListener);

        // Auto-acquire user lock for first connection (if no lock exists)
        const displayName = this.viewer?.displayName || 'Anonymous';
        screenLockService.acquireUserLock(this.udid, this.displayId, this.clientId, displayName);

        // Send initial count
        const count = sessionTracker.getSessionCount(this.udid, this.displayId);
        const viewers = sessionTracker.getSessionViewers(this.udid, this.displayId);
        this.sendSessionCount(count, viewers);

        // Send initial lock state
        this.sendLockState();
    }

    private sendSessionCount(count: number, viewers: SessionViewer[]): void {
        if (this.ws.readyState !== this.ws.OPEN) {
            return;
        }
        const message = JSON.stringify({
            type: 'sessionCount',
            udid: this.udid,
            displayId: this.displayId,
            count: count,
            viewers: viewers,
        });
        this.ws.send(message);
    }

    private sendLockState(): void {
        if (this.ws.readyState !== this.ws.OPEN || !this.udid || !this.clientId) {
            return;
        }
        const screenLockService = ScreenLockService.getInstance();
        const lock = screenLockService.getLock(this.udid, this.displayId);
        const isLockHolder = screenLockService.isLockHolder(this.udid, this.displayId, this.clientId);

        const message: LockStateMessage = {
            type: 'lockState',
            udid: this.udid,
            displayId: this.displayId,
            lock: lock,
            isLockHolder: isLockHolder,
        };
        this.ws.send(JSON.stringify(message));
    }

    private handleLockRequest(request: LockRequestMessage): void {
        if (!this.udid || !this.clientId) {
            return;
        }
        const screenLockService = ScreenLockService.getInstance();
        const displayName = this.viewer?.displayName || 'Anonymous';

        switch (request.action) {
            case 'acquire':
                if (request.lockType === 'workflow' && request.workflowId && request.workflowName) {
                    screenLockService.acquireWorkflowLock(
                        this.udid,
                        this.displayId,
                        request.workflowId,
                        request.workflowName,
                        this.clientId,
                    );
                } else {
                    screenLockService.acquireUserLock(this.udid, this.displayId, this.clientId, displayName);
                }
                break;
            case 'release':
                if (request.lockType === 'workflow' && request.workflowId) {
                    screenLockService.releaseLock(this.udid, this.displayId, request.workflowId);
                } else {
                    screenLockService.releaseLock(this.udid, this.displayId, this.clientId);
                }
                break;
            case 'forceUnlock':
                screenLockService.forceUnlock(this.udid, this.displayId, this.clientId, displayName);
                break;
            case 'emergencyUnlock':
                screenLockService.emergencyUnlock(this.udid, this.displayId);
                break;
        }
    }

    protected onSocketMessage(event: WS.MessageEvent): void {
        // Try to handle JSON lock requests
        if (typeof event.data === 'string') {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'lockRequest') {
                    this.handleLockRequest(message as LockRequestMessage);
                    return;
                }
            } catch {
                // Not JSON or not a lock request, pass through
            }
        }
        // Pass through to parent for normal handling
        super.onSocketMessage(event);
    }

    public release(): void {
        if (this.udid && this.clientId) {
            const sessionTracker = SessionTracker.getInstance();
            const screenLockService = ScreenLockService.getInstance();

            // Release lock if this client holds it
            screenLockService.releaseLock(this.udid, this.displayId, this.clientId);

            // Remove session count listener
            if (this.sessionCountListener) {
                sessionTracker.off('sessionCountChanged', this.sessionCountListener);
            }

            // Remove lock change listener
            if (this.lockChangeListener) {
                screenLockService.off('lockChanged', this.lockChangeListener);
            }

            sessionTracker.removeSession(this.udid, this.displayId, this.clientId);
        }
        super.release();
    }
}
