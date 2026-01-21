import { WebsocketProxy } from '../../mw/WebsocketProxy';
import { AdbUtils } from '../AdbUtils';
import WS from 'ws';
import { RequestParameters } from '../../mw/Mw';
import { ACTION } from '../../../common/Action';
import { SessionTracker, SessionCountChangedEvent } from '../services/SessionTracker';

export class WebsocketProxyOverAdb extends WebsocketProxy {
    private udid?: string;
    private displayId = 0;
    private clientId?: string;
    private sessionCountListener?: (event: SessionCountChangedEvent) => void;

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
        return this.createProxyOverAdb(ws, udid, remote, path);
    }

    public static createProxyOverAdb(
        ws: WS,
        udid: string,
        remote: string,
        path?: string | null,
    ): WebsocketProxyOverAdb {
        const service = new WebsocketProxyOverAdb(ws, udid);
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

    constructor(ws: WS, udid: string) {
        super(ws);
        this.udid = udid;
    }

    private registerSession(): void {
        if (!this.udid) {
            return;
        }
        const sessionTracker = SessionTracker.getInstance();
        this.clientId = sessionTracker.generateClientId();
        sessionTracker.addSession(this.udid, this.displayId, this.clientId);

        // Listen for session count changes for this device
        this.sessionCountListener = (event: SessionCountChangedEvent) => {
            if (event.udid === this.udid && event.displayId === this.displayId) {
                this.sendSessionCount(event.count);
            }
        };
        sessionTracker.on('sessionCountChanged', this.sessionCountListener);

        // Send initial count
        const count = sessionTracker.getSessionCount(this.udid, this.displayId);
        this.sendSessionCount(count);
    }

    private sendSessionCount(count: number): void {
        if (this.ws.readyState !== this.ws.OPEN) {
            return;
        }
        const message = JSON.stringify({
            type: 'sessionCount',
            udid: this.udid,
            displayId: this.displayId,
            count: count,
        });
        this.ws.send(message);
    }

    public release(): void {
        if (this.udid && this.clientId) {
            const sessionTracker = SessionTracker.getInstance();
            sessionTracker.removeSession(this.udid, this.displayId, this.clientId);
            if (this.sessionCountListener) {
                sessionTracker.off('sessionCountChanged', this.sessionCountListener);
            }
        }
        super.release();
    }
}
