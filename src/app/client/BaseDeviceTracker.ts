import { ManagerClient } from './ManagerClient';
import { Message } from '../../types/Message';
import { BaseDeviceDescriptor } from '../../types/BaseDeviceDescriptor';
import { DeviceTrackerEvent } from '../../types/DeviceTrackerEvent';
import { DeviceTrackerEventList } from '../../types/DeviceTrackerEventList';
import { html } from '../ui/HtmlTag';
import { ParamsDeviceTracker } from '../../types/ParamsDeviceTracker';
import { HostItem } from '../../types/Configuration';
import { Tool } from './Tool';
import Util from '../Util';
import { EventMap } from '../../common/TypedEmitter';

const TAG = '[BaseDeviceTracker]';

export abstract class BaseDeviceTracker<DD extends BaseDeviceDescriptor, TE extends EventMap> extends ManagerClient<
    ParamsDeviceTracker,
    TE
> {
    public static readonly ACTION_LIST = 'devicelist';
    public static readonly ACTION_DEVICE = 'device';
    public static readonly HOLDER_ELEMENT_ID = 'devices';
    public static readonly AttributePrefixInterfaceSelectFor = 'interface_select_for_';
    public static readonly AttributePlayerFullName = 'data-player-full-name';
    public static readonly AttributePlayerCodeName = 'data-player-code-name';
    public static readonly AttributePrefixPlayerFor = 'player_for_';
    protected static tools: Set<Tool> = new Set();
    protected static instanceId = 0;

    public static registerTool(tool: Tool): void {
        this.tools.add(tool);
    }

    public static buildUrl(item: HostItem): URL {
        const { secure, port, hostname } = item;
        const pathname = item.pathname ?? '/';
        const protocol = secure ? 'wss:' : 'ws:';
        const url = new URL(`${protocol}//${hostname}${pathname}`);
        if (port) {
            url.port = port.toString();
        }
        return url;
    }

    public static buildUrlForTracker(params: HostItem): URL {
        const wsUrl = this.buildUrl(params);
        wsUrl.searchParams.set('action', this.ACTION);
        return wsUrl;
    }

    public static buildLink(q: any, text: string, params: ParamsDeviceTracker): HTMLAnchorElement {
        let { hostname } = params;
        let port: string | number | undefined = params.port;
        let pathname = params.pathname ?? location.pathname;
        let protocol = params.secure ? 'https:' : 'http:';
        if (params.useProxy) {
            q.hostname = hostname;
            q.port = port;
            q.pathname = pathname;
            q.secure = params.secure;
            q.useProxy = true;
            protocol = location.protocol;
            hostname = location.hostname;
            port = location.port;
            pathname = location.pathname;
        }
        const hash = `#!${new URLSearchParams(q).toString()}`;
        const a = document.createElement('a');
        a.setAttribute('href', `${protocol}//${hostname}:${port}${pathname}${hash}`);
        a.setAttribute('rel', 'noopener noreferrer');
        a.setAttribute('target', '_blank');
        a.classList.add(`link-${q.action}`);
        a.innerText = text;
        return a;
    }

    protected title = 'Device list';
    protected tableId = 'base_device_list';
    protected descriptors: DD[] = [];
    protected elementId: string;
    protected trackerName = '';
    protected id = '';
    protected sectionTitle = 'Discovered Devices';
    protected isLocal = false;
    private created = false;
    private messageId = 0;

    protected constructor(params: ParamsDeviceTracker, protected readonly directUrl: string) {
        super(params);
        this.elementId = `tracker_instance${++BaseDeviceTracker.instanceId}`;
        this.trackerName = `Unavailable. Host: ${params.hostname}, type: ${params.type}`;
        // Determine if this is local or remote
        this.isLocal = params.hostname === location.hostname;
        // Section title shows just the hostname
        this.sectionTitle = params.hostname || 'Unknown';
        this.setBodyClass('list');
        this.setTitle();
    }

    public static parseParameters(params: URLSearchParams): ParamsDeviceTracker {
        const typedParams = super.parseParameters(params);
        const type = Util.parseString(params, 'type', true);
        if (type !== 'android' && type !== 'ios') {
            throw Error('Incorrect type');
        }
        return { ...typedParams, type };
    }

    protected getNextId(): number {
        return ++this.messageId;
    }

    protected buildDeviceTable(): void {
        const data = this.descriptors;
        const devices = this.getOrCreateTableHolder();
        const tbody = this.getOrBuildTableBody(devices);

        // For local devices, put cards directly in device-list
        // For remote devices, use tracker-section wrapper
        let block: Element;
        if (this.isLocal) {
            // Update the wrapper header with the tracker name
            this.updateWrapperHeader(this.trackerName);
            block = tbody;
            // Clear previous content for this tracker
            const existingCards = tbody.querySelectorAll(`[data-tracker-id="${this.elementId}"]`);
            existingCards.forEach((card) => card.remove());
        } else {
            block = this.getOrCreateTrackerBlock(tbody, this.trackerName);
        }

        if (data.length === 0) {
            if (!this.isLocal) {
                const emptyMessage = document.createElement('div');
                emptyMessage.className = 'empty-message';
                emptyMessage.textContent = 'No devices found';
                block.appendChild(emptyMessage);
            }
        } else {
            data.forEach((item) => {
                this.buildDeviceRow(block, item);
            });
        }
    }

    private updateWrapperHeader(trackerName: string): void {
        const wrapperId = 'devices-wrapper-local';
        const wrapper = document.getElementById(wrapperId);
        if (!wrapper) return;

        const header = wrapper.querySelector('.devices-wrapper-header');
        if (header) {
            header.textContent = `Local Devices ${trackerName}`;
        }
    }

    private setNameValue(parent: Element | null, name: string): void {
        if (!parent) {
            return;
        }
        const headerBlockId = `${this.elementId}_header`;
        let headerEl = document.getElementById(headerBlockId);
        if (!headerEl) {
            headerEl = document.createElement('div');
            headerEl.id = headerBlockId;
            headerEl.className = 'section-header';

            const titleEl = document.createElement('span');
            titleEl.className = 'section-title';
            titleEl.textContent = this.sectionTitle;
            headerEl.appendChild(titleEl);
        }

        // Update or create the tracker name subtitle
        const nameBlockId = `${this.elementId}_name`;
        let nameEl = document.getElementById(nameBlockId);
        if (!nameEl) {
            nameEl = document.createElement('span');
            nameEl.id = nameBlockId;
            nameEl.className = 'tracker-subtitle';
            headerEl.appendChild(nameEl);
        }
        nameEl.innerText = name;

        parent.insertBefore(headerEl, parent.firstChild);
    }

    private getOrCreateTrackerBlock(parent: Element, controlCenterName: string): Element {
        let el = document.getElementById(this.elementId);
        if (!el) {
            el = document.createElement('div');
            el.id = this.elementId;
            el.className = 'tracker-section';
            parent.appendChild(el);
            this.created = true;
        } else {
            while (el.children.length) {
                el.removeChild(el.children[0]);
            }
        }
        this.setNameValue(el, controlCenterName);
        return el;
    }

    protected abstract buildDeviceRow(tbody: Element, device: DD): void;

    protected onSocketClose(event: CloseEvent): void {
        if (this.destroyed) {
            return;
        }
        console.log(TAG, `Connection closed: ${event.reason}`);
        setTimeout(() => {
            this.openNewConnection();
        }, 2000);
    }

    protected onSocketMessage(event: MessageEvent): void {
        let message: Message;
        try {
            message = JSON.parse(event.data);
        } catch (error: any) {
            console.error(TAG, error.message);
            console.log(TAG, error.data);
            return;
        }
        switch (message.type) {
            case BaseDeviceTracker.ACTION_LIST: {
                const event = message.data as DeviceTrackerEventList<DD>;
                this.descriptors = event.list;
                this.setIdAndHostName(event.id, event.name);
                this.buildDeviceTable();
                break;
            }
            case BaseDeviceTracker.ACTION_DEVICE: {
                const event = message.data as DeviceTrackerEvent<DD>;
                this.setIdAndHostName(event.id, event.name);
                this.updateDescriptor(event.device);
                this.buildDeviceTable();
                break;
            }
            default:
                console.log(TAG, `Unknown message type: ${message.type}`);
        }
    }

    protected setIdAndHostName(id: string, trackerName: string): void {
        if (this.id === id && this.trackerName === trackerName) {
            return;
        }
        this.id = id;
        this.trackerName = trackerName;
        this.setNameValue(document.getElementById(this.elementId), trackerName);
    }

    protected getOrCreateTableHolder(): HTMLElement {
        const id = BaseDeviceTracker.HOLDER_ELEMENT_ID;
        let devices = document.getElementById(id);
        if (!devices) {
            devices = document.createElement('div');
            devices.id = id;
            devices.className = 'table-wrapper';
            document.body.appendChild(devices);
        }
        return devices;
    }

    protected updateDescriptor(descriptor: DD): void {
        const idx = this.descriptors.findIndex((item: DD) => {
            return item.udid === descriptor.udid;
        });
        if (idx !== -1) {
            this.descriptors[idx] = descriptor;
        } else {
            this.descriptors.push(descriptor);
        }
    }

    protected getOrBuildTableBody(parent: HTMLElement): Element {
        const className = 'device-list';
        const wrapperType = this.isLocal ? 'local' : 'remote';
        const wrapperId = `devices-wrapper-${wrapperType}`;
        // Use a single device-list ID for all remotes, separate for locals by type
        const deviceListId = this.isLocal ? `${this.tableId}_local` : 'remote_device_list';

        // Get or create the wrapper section for local/remote
        let wrapper = document.getElementById(wrapperId);
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = wrapperId;
            wrapper.className = `devices-wrapper devices-wrapper-${wrapperType}`;

            // Add section header
            const header = document.createElement('div');
            header.className = 'devices-wrapper-header';
            header.textContent = this.isLocal ? 'Local Devices' : 'Remote Devices';
            wrapper.appendChild(header);

            parent.appendChild(wrapper);
        }

        // Get or create the device-list inside the wrapper
        let tbody = document.querySelector(
            `#${wrapperId} #${deviceListId}.${className}`,
        ) as Element;
        if (!tbody) {
            const fragment = html`<div id="${deviceListId}" class="${className}"></div>`.content;
            wrapper.appendChild(fragment);
            const last = wrapper.children.item(wrapper.children.length - 1);
            if (last) {
                tbody = last;
            }
        }
        return tbody;
    }

    public getDescriptorByUdid(udid: string): DD | undefined {
        if (!this.descriptors.length) {
            return;
        }
        return this.descriptors.find((descriptor: DD) => {
            return descriptor.udid === udid;
        });
    }

    public destroy(): void {
        super.destroy();
        if (this.created) {
            const el = document.getElementById(this.elementId);
            if (el) {
                const { parentElement } = el;
                el.remove();
                if (parentElement && !parentElement.children.length) {
                    parentElement.remove();
                }
            }
        }
        const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
        if (holder && !holder.children.length) {
            holder.remove();
        }
    }

    protected supportMultiplexing(): boolean {
        return true;
    }

    protected getChannelCode(): string {
        throw Error('Not implemented. Must override');
    }

    protected getChannelInitData(): Buffer {
        const code = this.getChannelCode();
        const buffer = Buffer.alloc(code.length);
        buffer.write(code, 'ascii');
        return buffer;
    }
}
