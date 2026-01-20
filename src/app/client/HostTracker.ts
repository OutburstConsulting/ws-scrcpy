import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { MessageError, MessageHosts, MessageType } from '../../common/HostTrackerMessage';
import { ACTION } from '../../common/Action';
import { DeviceTracker as GoogDeviceTracker } from '../googDevice/client/DeviceTracker';
import { DeviceTracker as ApplDeviceTracker } from '../applDevice/client/DeviceTracker';
import { ParamsBase } from '../../types/ParamsBase';
import { HostItem } from '../../types/Configuration';
import { ChannelCode } from '../../common/ChannelCode';

const TAG = '[HostTracker]';

// Type for custom saved connections
interface SavedConnection {
    id: string;
    name: string;
    hostname: string;
    port: number;
    secure: boolean;
    type: 'android' | 'ios';
    createdAt: number;
}

export interface HostTrackerEvents {
    // hosts: HostItem[];
    disconnected: CloseEvent;
    error: string;
}

export class HostTracker extends ManagerClient<ParamsBase, HostTrackerEvents> {
    private static instance?: HostTracker;
    private static readonly API_BASE = '/api/connections';

    public static start(): void {
        this.getInstance();
    }

    public static getInstance(): HostTracker {
        if (!this.instance) {
            this.instance = new HostTracker();
        }
        return this.instance;
    }

    // Get saved custom connections from server
    private static async getSavedConnections(): Promise<SavedConnection[]> {
        try {
            const response = await fetch(this.API_BASE);
            const data = await response.json();
            if (data.success) {
                return data.connections;
            }
            return [];
        } catch (error) {
            console.error(TAG, 'Failed to get connections:', error);
            return [];
        }
    }

    // Save a custom connection to server
    private static async saveConnection(connection: SavedConnection): Promise<boolean> {
        try {
            const response = await fetch(this.API_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(connection),
            });
            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error(TAG, 'Failed to save connection:', error);
            return false;
        }
    }

    // Delete a saved connection from server
    private static async deleteConnection(connectionId: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.API_BASE}/${connectionId}`, {
                method: 'DELETE',
            });
            const data = await response.json();
            return data.success;
        } catch (error) {
            console.error(TAG, 'Failed to delete connection:', error);
            return false;
        }
    }

    // Generate unique ID for connection
    private static generateId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    private trackers: Array<GoogDeviceTracker | ApplDeviceTracker> = [];
    private customConnectionsContainer?: HTMLElement;
    private customConnectionsPanel?: HTMLElement;

    constructor() {
        super({ action: ACTION.LIST_HOSTS });
        this.openNewConnection();
        if (this.ws) {
            this.ws.binaryType = 'arraybuffer';
        }
        // Build the custom connections UI
        this.buildCustomConnectionsUI();
    }

    private buildCustomConnectionsUI(): void {
        // Create or get the devices holder
        let holder = document.getElementById('devices');
        if (!holder) {
            holder = document.createElement('div');
            holder.id = 'devices';
            holder.className = 'table-wrapper';
            document.body.appendChild(holder);
        }

        // Add main title if not present
        if (!document.getElementById('ws-scrcpy-title')) {
            const mainTitle = document.createElement('h1');
            mainTitle.id = 'ws-scrcpy-title';
            mainTitle.className = 'main-title';
            mainTitle.textContent = 'WS-SCRCPY';
            holder.insertBefore(mainTitle, holder.firstChild);
        }

        // Create the custom connections section
        const section = document.createElement('div');
        section.className = 'custom-connections-section';
        this.customConnectionsPanel = section;

        // Section header with title and Add button
        const header = document.createElement('div');
        header.className = 'section-header';

        const title = document.createElement('span');
        title.className = 'section-title';
        title.textContent = 'Custom Connections';
        header.appendChild(title);

        const addBtn = document.createElement('sl-button');
        addBtn.setAttribute('variant', 'text');
        addBtn.setAttribute('size', 'small');
        addBtn.innerHTML = '<sl-icon name="plus-lg" slot="prefix"></sl-icon>Add';
        addBtn.addEventListener('click', () => this.showAddConnectionDialog());
        header.appendChild(addBtn);

        section.appendChild(header);

        // Connections list container
        this.customConnectionsContainer = document.createElement('div');
        this.customConnectionsContainer.className = 'custom-connections-list';
        section.appendChild(this.customConnectionsContainer);

        // Append at the end of the holder (after device trackers)
        holder.appendChild(section);

        // Render existing saved connections
        this.renderSavedConnections();
    }

    private async renderSavedConnections(): Promise<void> {
        if (!this.customConnectionsContainer) return;

        this.customConnectionsContainer.innerHTML = '';

        // Show loading state
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'empty-message';
        loadingMsg.textContent = 'Loading...';
        this.customConnectionsContainer.appendChild(loadingMsg);

        const connections = await HostTracker.getSavedConnections();

        this.customConnectionsContainer.innerHTML = '';

        if (connections.length === 0) {
            const emptyMsg = document.createElement('div');
            emptyMsg.className = 'empty-message';
            emptyMsg.textContent = 'No custom connections';
            this.customConnectionsContainer.appendChild(emptyMsg);
            return;
        }

        connections.forEach((conn) => {
            const item = this.createConnectionItem(conn);
            this.customConnectionsContainer!.appendChild(item);
        });
    }

    private createConnectionItem(conn: SavedConnection): HTMLElement {
        const item = document.createElement('div');
        item.className = 'custom-connection-item';

        const info = document.createElement('div');
        info.className = 'custom-connection-info';

        const name = document.createElement('div');
        name.className = 'custom-connection-name';
        name.textContent = conn.name;
        info.appendChild(name);

        const url = document.createElement('div');
        url.className = 'custom-connection-url';
        url.textContent = `${conn.secure ? 'wss' : 'ws'}://${conn.hostname}:${conn.port} (${conn.type})`;
        info.appendChild(url);

        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'custom-connection-actions';

        // Connect button
        const connectBtn = document.createElement('sl-tooltip');
        connectBtn.setAttribute('content', 'Connect');
        const connectIcon = document.createElement('sl-icon-button');
        connectIcon.setAttribute('name', 'plug');
        connectIcon.setAttribute('label', 'Connect');
        connectIcon.addEventListener('click', () => this.connectToSavedConnection(conn));
        connectBtn.appendChild(connectIcon);
        actions.appendChild(connectBtn);

        // Delete button
        const deleteBtn = document.createElement('sl-tooltip');
        deleteBtn.setAttribute('content', 'Delete');
        const deleteIcon = document.createElement('sl-icon-button');
        deleteIcon.setAttribute('name', 'trash');
        deleteIcon.setAttribute('label', 'Delete');
        deleteIcon.addEventListener('click', async () => {
            await HostTracker.deleteConnection(conn.id);
            this.renderSavedConnections();
        });
        deleteBtn.appendChild(deleteIcon);
        actions.appendChild(deleteBtn);

        item.appendChild(actions);
        return item;
    }

    private showAddConnectionDialog(): void {
        // Create dialog
        const dialog = document.createElement('sl-dialog');
        dialog.setAttribute('label', 'Add Custom Connection');
        dialog.className = 'add-connection-dialog';

        // Prevent dialog from closing automatically - only close via buttons
        let allowClose = false;
        dialog.addEventListener('sl-request-close', (event: Event) => {
            if (!allowClose) {
                event.preventDefault();
            }
        });

        const closeDialog = () => {
            allowClose = true;
            (dialog as unknown as { hide: () => void }).hide();
        };

        const form = document.createElement('div');
        form.className = 'add-connection-form';

        // Name input
        const nameInput = document.createElement('sl-input');
        nameInput.setAttribute('label', 'Connection Name');
        nameInput.setAttribute('placeholder', 'My Device');
        nameInput.setAttribute('required', '');
        form.appendChild(nameInput);

        // Hostname input
        const hostInput = document.createElement('sl-input');
        hostInput.setAttribute('label', 'Hostname / IP');
        hostInput.setAttribute('placeholder', '192.168.1.100');
        hostInput.setAttribute('required', '');
        form.appendChild(hostInput);

        // Port input
        const portInput = document.createElement('sl-input');
        portInput.setAttribute('label', 'Port');
        portInput.setAttribute('placeholder', '8000');
        portInput.setAttribute('type', 'number');
        portInput.setAttribute('value', '8000');
        form.appendChild(portInput);

        // Type select
        const typeSelect = document.createElement('sl-select');
        typeSelect.setAttribute('label', 'Device Type');
        typeSelect.setAttribute('value', 'android');
        const androidOption = document.createElement('sl-option');
        androidOption.setAttribute('value', 'android');
        androidOption.textContent = 'Android';
        typeSelect.appendChild(androidOption);
        const iosOption = document.createElement('sl-option');
        iosOption.setAttribute('value', 'ios');
        iosOption.textContent = 'iOS';
        typeSelect.appendChild(iosOption);
        form.appendChild(typeSelect);

        // Secure checkbox row
        const secureRow = document.createElement('div');
        secureRow.className = 'secure-checkbox-row';

        const secureLabel = document.createElement('span');
        secureLabel.textContent = 'Use secure connection (wss://)';
        secureRow.appendChild(secureLabel);

        const secureCheckbox = document.createElement('input');
        secureCheckbox.type = 'checkbox';
        secureCheckbox.className = 'secure-checkbox';
        secureRow.appendChild(secureCheckbox);

        form.appendChild(secureRow);

        dialog.appendChild(form);

        // Footer buttons
        const cancelBtn = document.createElement('sl-button');
        cancelBtn.setAttribute('slot', 'footer');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => closeDialog());
        dialog.appendChild(cancelBtn);

        const saveBtn = document.createElement('sl-button');
        saveBtn.setAttribute('slot', 'footer');
        saveBtn.setAttribute('variant', 'primary');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', async () => {
            const nameValue = (nameInput as unknown as { value: string }).value.trim();
            const hostValue = (hostInput as unknown as { value: string }).value.trim();
            const portValue = parseInt((portInput as unknown as { value: string }).value, 10) || 8000;
            const typeValue = (typeSelect as unknown as { value: string }).value as 'android' | 'ios';
            const secureValue = secureCheckbox.checked;

            if (!nameValue || !hostValue) {
                return;
            }

            const connection: SavedConnection = {
                id: HostTracker.generateId(),
                name: nameValue,
                hostname: hostValue,
                port: portValue,
                secure: secureValue,
                type: typeValue,
                createdAt: Date.now(),
            };

            await HostTracker.saveConnection(connection);
            this.renderSavedConnections();
            closeDialog();
        });
        dialog.appendChild(saveBtn);

        // Close handler - check event.target to avoid responding to child component events
        dialog.addEventListener('sl-after-hide', (event: Event) => {
            if (event.target === dialog) {
                dialog.remove();
            }
        });

        document.body.appendChild(dialog);
        dialog.show();
    }

    private connectToSavedConnection(conn: SavedConnection): void {
        const hostItem: HostItem = {
            useProxy: false,
            secure: conn.secure,
            port: conn.port,
            hostname: conn.hostname,
            pathname: '/',
            type: conn.type,
        };
        this.startTracker(hostItem);
    }

    protected onSocketClose(ev: CloseEvent): void {
        console.log(TAG, 'WS closed');
        this.emit('disconnected', ev);
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            // TODO: rewrite to binary
            message = JSON.parse(event.data);
        } catch (error: any) {
            console.error(TAG, error.message);
            console.log(TAG, error.data);
            return;
        }
        switch (message.type) {
            case MessageType.ERROR: {
                const msg = message as MessageError;
                console.error(TAG, msg.data);
                this.emit('error', msg.data);
                break;
            }
            case MessageType.HOSTS: {
                const msg = message as MessageHosts;
                // this.emit('hosts', msg.data);
                if (msg.data.local) {
                    msg.data.local.forEach(({ type }) => {
                        const secure = location.protocol === 'https:';
                        const port = location.port ? parseInt(location.port, 10) : secure ? 443 : 80;
                        const { hostname, pathname } = location;
                        if (type !== 'android' && type !== 'ios') {
                            console.warn(TAG, `Unsupported host type: "${type}"`);
                            return;
                        }
                        const hostItem: HostItem = { useProxy: false, secure, port, hostname, pathname, type };
                        this.startTracker(hostItem);
                    });
                }
                if (msg.data.remote) {
                    msg.data.remote.forEach((item) => this.startTracker(item));
                }
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    private startTracker(hostItem: HostItem): void {
        switch (hostItem.type) {
            case 'android':
                this.trackers.push(GoogDeviceTracker.start(hostItem));
                break;
            case 'ios':
                this.trackers.push(ApplDeviceTracker.start(hostItem));
                break;
            default:
                console.warn(TAG, `Unsupported host type: "${hostItem.type}"`);
        }
    }

    protected onSocketOpen(): void {
        // do nothing
    }

    public destroy(): void {
        super.destroy();
        this.trackers.forEach((tracker) => {
            tracker.destroy();
        });
        this.trackers.length = 0;

        // Remove custom connections panel
        if (this.customConnectionsPanel && this.customConnectionsPanel.parentElement) {
            this.customConnectionsPanel.parentElement.removeChild(this.customConnectionsPanel);
            this.customConnectionsPanel = undefined;
        }

        // Remove the devices holder if empty
        const holder = document.getElementById('devices');
        if (holder && holder.children.length === 0) {
            holder.remove();
        }
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelInitData(): Buffer {
        const buffer = Buffer.alloc(4);
        buffer.write(ChannelCode.HSTS, 'ascii');
        return buffer;
    }
}
