import '../../../style/devicelist.css';
import { BaseDeviceTracker } from '../../client/BaseDeviceTracker';
import { SERVER_PORT } from '../../../common/Constants';
import { ACTION } from '../../../common/Action';
import GoogDeviceDescriptor from '../../../types/GoogDeviceDescriptor';
import { ControlCenterCommand } from '../../../common/ControlCenterCommand';
import Util from '../../Util';
import { Attribute } from '../../Attribute';
import { DeviceState } from '../../../common/DeviceState';
import { Message } from '../../../types/Message';
import { ParamsDeviceTracker } from '../../../types/ParamsDeviceTracker';
import { HostItem } from '../../../types/Configuration';
import { ChannelCode } from '../../../common/ChannelCode';
import { Tool } from '../../client/Tool';
import { StreamClientScrcpy } from './StreamClientScrcpy';
import { ConfigureScrcpy } from './ConfigureScrcpy';
import { ParamsStreamScrcpy } from '../../../types/ParamsStreamScrcpy';
import { HostTracker } from '../../client/HostTracker';

export class DeviceTracker extends BaseDeviceTracker<GoogDeviceDescriptor, never> {
    public static readonly ACTION = ACTION.GOOG_DEVICE_LIST;
    public static readonly CREATE_DIRECT_LINKS = true;
    private static instancesByUrl: Map<string, DeviceTracker> = new Map();
    protected static tools: Set<Tool> = new Set();
    protected tableId = 'goog_device_list';

    // Storage keys and constants
    private static readonly PLAYER_STORAGE_KEY = 'device_list::selected_player';
    private static readonly DEFAULT_PLAYER = 'mse';
    private static readonly CONFIGURE_OPTION = 'configure';

    // Get the last selected player from localStorage
    private static getSelectedPlayer(): string {
        if (!window.localStorage) {
            return this.DEFAULT_PLAYER;
        }
        const stored = window.localStorage.getItem(this.PLAYER_STORAGE_KEY);
        if (stored) {
            // Verify the player still exists
            const players = StreamClientScrcpy.getPlayers();
            const exists = players.some((p) => p.playerCodeName === stored);
            if (exists) {
                return stored;
            }
        }
        return this.DEFAULT_PLAYER;
    }

    // Save the selected player to localStorage
    private static setSelectedPlayer(playerCodeName: string): void {
        if (!window.localStorage) {
            return;
        }
        window.localStorage.setItem(this.PLAYER_STORAGE_KEY, playerCodeName);
    }

    public static start(hostItem: HostItem): DeviceTracker {
        const url = this.buildUrlForTracker(hostItem).toString();
        let instance = this.instancesByUrl.get(url);
        if (!instance) {
            instance = new DeviceTracker(hostItem, url);
        }
        return instance;
    }

    public static getInstance(hostItem: HostItem): DeviceTracker {
        return this.start(hostItem);
    }

    protected constructor(params: HostItem, directUrl: string) {
        super({ ...params, action: DeviceTracker.ACTION }, directUrl);
        DeviceTracker.instancesByUrl.set(directUrl, this);
        this.buildDeviceTable();
        this.openNewConnection();
    }

    protected onSocketOpen(): void {
        // nothing here;
    }

    protected setIdAndHostName(id: string, hostName: string): void {
        super.setIdAndHostName(id, hostName);
        for (const value of DeviceTracker.instancesByUrl.values()) {
            if (value.id === id && value !== this) {
                console.warn(
                    `Tracker with url: "${this.url}" has the same id(${this.id}) as tracker with url "${value.url}"`,
                );
                console.warn(`This tracker will shut down`);
                this.destroy();
            }
        }
    }

    onInterfaceSelected = (event: Event): void => {
        const selectElement = event.currentTarget as HTMLSelectElement;
        const option = selectElement.selectedOptions[0];
        const url = decodeURI(option.getAttribute(Attribute.URL) || '');
        const name = option.getAttribute(Attribute.NAME) || '';
        const fullName = decodeURIComponent(selectElement.getAttribute(Attribute.FULL_NAME) || '');
        const udid = selectElement.getAttribute(Attribute.UDID) || '';
        this.updateLink({ url, name, fullName, udid, store: true });
    };

    private updateLink(params: { url: string; name: string; fullName: string; udid: string; store: boolean }): void {
        const { url, name, fullName, udid, store } = params;
        const playerTds = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixPlayerFor}${fullName}`),
        );
        if (typeof udid !== 'string') {
            return;
        }
        if (store) {
            const localStorageKey = DeviceTracker.getLocalStorageKey(fullName || '');
            if (localStorage && name) {
                localStorage.setItem(localStorageKey, name);
            }
        }
        const action = ACTION.STREAM_SCRCPY;
        playerTds.forEach((item) => {
            item.innerHTML = '';
            const playerFullName = item.getAttribute(DeviceTracker.AttributePlayerFullName);
            const playerCodeName = item.getAttribute(DeviceTracker.AttributePlayerCodeName);
            if (!playerFullName || !playerCodeName) {
                return;
            }
            const link = DeviceTracker.buildLink(
                {
                    action,
                    udid,
                    player: decodeURIComponent(playerCodeName),
                    ws: url,
                },
                decodeURIComponent(playerFullName),
                this.params,
            );
            item.appendChild(link);
        });
    }

    onActionButtonClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLButtonElement;
        const udid = button.getAttribute(Attribute.UDID);
        const pidString = button.getAttribute(Attribute.PID) || '';
        const command = button.getAttribute(Attribute.COMMAND) as string;
        const pid = parseInt(pidString, 10);
        const data: Message = {
            id: this.getNextId(),
            type: command,
            data: {
                udid: typeof udid === 'string' ? udid : undefined,
                pid: isNaN(pid) ? undefined : pid,
            },
        };

        if (this.ws && this.ws.readyState === this.ws.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    };

    private static getLocalStorageKey(udid: string): string {
        return `device_list::${udid}::interface`;
    }

    protected static createUrl(params: ParamsDeviceTracker, udid = ''): URL {
        const secure = !!params.secure;
        const hostname = params.hostname || location.hostname;
        const port = typeof params.port === 'number' ? params.port : secure ? 443 : 80;
        const pathname = params.pathname || location.pathname;
        const urlObject = this.buildUrl({ ...params, secure, hostname, port, pathname });
        if (udid) {
            urlObject.searchParams.set('action', ACTION.PROXY_ADB);
            urlObject.searchParams.set('remote', `tcp:${SERVER_PORT.toString(10)}`);
            urlObject.searchParams.set('udid', udid);
        }
        return urlObject;
    }

    protected static createInterfaceOption(name: string, url: string): HTMLOptionElement {
        const optionElement = document.createElement('option');
        optionElement.setAttribute(Attribute.URL, url);
        optionElement.setAttribute(Attribute.NAME, name);
        optionElement.innerText = `proxy over adb`;
        return optionElement;
    }

    protected buildDeviceRow(tbody: Element, device: GoogDeviceDescriptor): void {
        let selectedInterfaceName = '';
        const fullName = `${this.id}_${Util.escapeUdid(device.udid)}`;
        const isActive = device.state === DeviceState.DEVICE;
        const hasPid = device.pid !== -1;
        const servicesId = `device_services_${fullName}`;
        const viewStreamBtnId = `view_stream_${fullName}`;
        const interfaceSelectId = `interface_select_${fullName}`;

        // Build Shoelace card for each device
        const card = document.createElement('sl-card');
        card.className = `device-card ${isActive ? 'active' : 'not-active'}`;
        card.setAttribute('data-tracker-id', this.elementId);

        // Card header with device info
        const header = document.createElement('div');
        header.slot = 'header';
        header.className = 'device-card-header';

        const deviceInfo = document.createElement('div');
        deviceInfo.className = 'device-card-info';

        const deviceName = document.createElement('div');
        deviceName.className = 'device-card-name';
        deviceName.textContent = `${device['ro.product.manufacturer']} ${device['ro.product.model']}`;
        deviceInfo.appendChild(deviceName);

        const deviceMeta = document.createElement('div');
        deviceMeta.className = 'device-card-meta';
        deviceMeta.innerHTML = `
            <span class="device-serial">${device.udid}</span>
            <span class="device-version">Android ${device['ro.build.version.release']} (SDK ${device['ro.build.version.sdk']})</span>
        `;
        deviceInfo.appendChild(deviceMeta);

        header.appendChild(deviceInfo);

        // Status indicator
        const statusBadge = document.createElement('sl-badge');
        statusBadge.setAttribute('variant', isActive ? 'success' : 'neutral');
        statusBadge.textContent = isActive ? (hasPid ? 'Ready' : 'Inactive') : 'Offline';
        if (isActive && hasPid) {
            statusBadge.setAttribute('pulse', '');
        }
        header.appendChild(statusBadge);

        card.appendChild(header);

        // Card body with actions
        const body = document.createElement('div');
        body.className = 'device-card-body';
        body.id = servicesId;

        // Hidden interface select (for internal use)
        const proxyInterfaceUrl = DeviceTracker.createUrl(this.params, device.udid).toString();
        const proxyInterfaceName = 'proxy';
        const localStorageKey = DeviceTracker.getLocalStorageKey(fullName);
        const lastSelected = localStorage && localStorage.getItem(localStorageKey);
        const selectElement = document.createElement('select');
        selectElement.id = interfaceSelectId;
        selectElement.style.display = 'none';
        selectElement.setAttribute(Attribute.UDID, device.udid);
        selectElement.setAttribute(Attribute.FULL_NAME, fullName);
        selectElement.setAttribute(
            'name',
            encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`),
        );

        /// #if SCRCPY_LISTENS_ON_ALL_INTERFACES
        device.interfaces.forEach((value) => {
            const params = {
                ...this.params,
                secure: false,
                hostname: value.ipv4,
                port: SERVER_PORT,
            };
            const url = DeviceTracker.createUrl(params).toString();
            const optionElement = DeviceTracker.createInterfaceOption(value.name, url);
            optionElement.innerText = `${value.name}: ${value.ipv4}`;
            selectElement.appendChild(optionElement);
            if (lastSelected) {
                if (lastSelected === value.name || !selectedInterfaceName) {
                    optionElement.selected = true;
                    selectedInterfaceName = value.name;
                }
            } else if (device['wifi.interface'] === value.name) {
                optionElement.selected = true;
            }
        });
        /// #else
        selectedInterfaceName = proxyInterfaceName;
        /// #endif

        if (isActive) {
            const adbProxyOption = DeviceTracker.createInterfaceOption(proxyInterfaceName, proxyInterfaceUrl);
            if (lastSelected === proxyInterfaceName || !selectedInterfaceName) {
                adbProxyOption.selected = true;
                selectedInterfaceName = proxyInterfaceName;
            }
            selectElement.appendChild(adbProxyOption);
        }
        selectElement.onchange = this.onInterfaceSelected;
        body.appendChild(selectElement);

        // View Stream button and player dropdown - only show for active devices with server running
        if (isActive && hasPid) {
            const streamContainer = document.createElement('div');
            streamContainer.className = 'stream-action-container';

            // Player dropdown
            const playerSelectId = `player_select_${fullName}`;
            const playerSelect = document.createElement('sl-select');
            playerSelect.id = playerSelectId;
            playerSelect.setAttribute('size', 'medium');
            playerSelect.setAttribute('placeholder', 'Select Player');
            playerSelect.className = 'player-select';

            // Get available players and last selected
            const players = StreamClientScrcpy.getPlayers();
            const lastSelectedPlayer = DeviceTracker.getSelectedPlayer();

            players.forEach((playerClass) => {
                const option = document.createElement('sl-option');
                option.setAttribute('value', playerClass.playerCodeName);
                option.textContent = playerClass.playerFullName;
                playerSelect.appendChild(option);
            });

            // Add divider and Configure option
            const divider = document.createElement('sl-divider');
            playerSelect.appendChild(divider);

            const configureOption = document.createElement('sl-option');
            configureOption.setAttribute('value', DeviceTracker.CONFIGURE_OPTION);
            configureOption.textContent = 'Configure...';
            playerSelect.appendChild(configureOption);

            // Set the default value
            playerSelect.setAttribute('value', lastSelectedPlayer);

            // Save selection when changed
            playerSelect.addEventListener('sl-change', (e: Event) => {
                const target = e.target as HTMLElement & { value: string };
                DeviceTracker.setSelectedPlayer(target.value);
            });

            streamContainer.appendChild(playerSelect);

            // View Stream button
            const viewStreamBtn = document.createElement('sl-button');
            viewStreamBtn.id = viewStreamBtnId;
            viewStreamBtn.setAttribute('variant', 'primary');
            viewStreamBtn.setAttribute('size', 'medium');
            viewStreamBtn.innerHTML = '<sl-icon name="play-circle" slot="prefix"></sl-icon>View Stream';
            viewStreamBtn.setAttribute(Attribute.UDID, device.udid);
            viewStreamBtn.setAttribute(Attribute.FULL_NAME, fullName);
            viewStreamBtn.setAttribute(Attribute.SECURE, String(this.params.secure));
            viewStreamBtn.setAttribute(Attribute.HOSTNAME, this.params.hostname || '');
            viewStreamBtn.setAttribute(Attribute.PORT, String(this.params.port));
            viewStreamBtn.setAttribute(Attribute.PATHNAME, this.params.pathname || '');
            viewStreamBtn.setAttribute(Attribute.USE_PROXY, String(this.params.useProxy));
            viewStreamBtn.setAttribute('data-player-select', playerSelectId);
            viewStreamBtn.onclick = this.onViewStreamClick;
            streamContainer.appendChild(viewStreamBtn);

            body.appendChild(streamContainer);
        } else if (isActive && !hasPid) {
            // Start server button
            const startServerBtn = document.createElement('sl-button');
            startServerBtn.setAttribute('variant', 'neutral');
            startServerBtn.setAttribute('size', 'medium');
            startServerBtn.innerHTML = '<sl-icon name="power" slot="prefix"></sl-icon>Start Server';
            startServerBtn.setAttribute(Attribute.UDID, device.udid);
            startServerBtn.setAttribute(Attribute.PID, String(device.pid));
            startServerBtn.setAttribute(Attribute.COMMAND, ControlCenterCommand.START_SERVER);
            startServerBtn.onclick = this.onActionButtonClick;
            body.appendChild(startServerBtn);
        } else {
            // Offline message
            const offlineMsg = document.createElement('div');
            offlineMsg.className = 'device-offline-msg';
            const timestamp = device['last.update.timestamp'];
            if (timestamp) {
                const date = new Date(timestamp);
                offlineMsg.textContent = `Last seen: ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
            } else {
                offlineMsg.textContent = 'Device is offline';
            }
            body.appendChild(offlineMsg);
        }

        // Add tools (Shell, DevTools, File Listing)
        const toolsContainer = document.createElement('div');
        toolsContainer.className = 'device-tools';

        DeviceTracker.tools.forEach((tool) => {
            const entry = tool.createEntryForDeviceList(device, 'tool-entry', this.params);
            if (entry) {
                if (Array.isArray(entry)) {
                    entry.forEach((item) => {
                        item && toolsContainer.appendChild(item);
                    });
                } else {
                    toolsContainer.appendChild(entry);
                }
            }
        });

        if (toolsContainer.children.length > 0) {
            body.appendChild(toolsContainer);
        }

        card.appendChild(body);

        // Card footer with server controls (for active devices)
        if (isActive && hasPid) {
            const footer = document.createElement('div');
            footer.slot = 'footer';
            footer.className = 'device-card-footer';

            const killServerBtn = document.createElement('sl-button');
            killServerBtn.setAttribute('variant', 'text');
            killServerBtn.setAttribute('size', 'small');
            killServerBtn.innerHTML = '<sl-icon name="stop-circle" slot="prefix"></sl-icon>Stop Server';
            killServerBtn.setAttribute(Attribute.UDID, device.udid);
            killServerBtn.setAttribute(Attribute.PID, String(device.pid));
            killServerBtn.setAttribute(Attribute.COMMAND, ControlCenterCommand.KILL_SERVER);
            killServerBtn.onclick = this.onActionButtonClick;
            footer.appendChild(killServerBtn);

            card.appendChild(footer);
        }

        tbody.appendChild(card);
    }

    onViewStreamClick = (event: MouseEvent): void => {
        const button = event.currentTarget as HTMLElement;
        const udid = Util.parseStringEnv(button.getAttribute(Attribute.UDID) || '');
        const fullName = button.getAttribute(Attribute.FULL_NAME) || '';
        const secure = Util.parseBooleanEnv(button.getAttribute(Attribute.SECURE) || undefined) || false;
        const hostname = Util.parseStringEnv(button.getAttribute(Attribute.HOSTNAME) || undefined) || '';
        const port = Util.parseIntEnv(button.getAttribute(Attribute.PORT) || undefined);
        const pathname = Util.parseStringEnv(button.getAttribute(Attribute.PATHNAME) || undefined) || '';
        const useProxy = Util.parseBooleanEnv(button.getAttribute(Attribute.USE_PROXY) || undefined);

        if (!udid || typeof port !== 'number') {
            return;
        }

        // Get interface URL from hidden select
        const selectElements = document.getElementsByName(
            encodeURIComponent(`${DeviceTracker.AttributePrefixInterfaceSelectFor}${fullName}`),
        );
        if (!selectElements || !selectElements.length) {
            return;
        }
        const select = selectElements[0] as HTMLSelectElement;
        const optionElement = select.options[select.selectedIndex];
        const ws = optionElement.getAttribute(Attribute.URL);

        if (!ws) {
            return;
        }

        // Get the selected player from the dropdown
        const playerSelectId = button.getAttribute('data-player-select');
        let playerCodeName = DeviceTracker.getSelectedPlayer();

        if (playerSelectId) {
            const playerSelect = document.getElementById(playerSelectId) as HTMLElement & { value: string };
            if (playerSelect && playerSelect.value) {
                playerCodeName = playerSelect.value;
                // Only save if it's not the configure option
                if (playerCodeName !== DeviceTracker.CONFIGURE_OPTION) {
                    DeviceTracker.setSelectedPlayer(playerCodeName);
                }
            }
        }

        // If "Configure..." is selected, open the configuration dialog
        if (playerCodeName === DeviceTracker.CONFIGURE_OPTION) {
            const descriptor = this.getDescriptorByUdid(udid);
            if (!descriptor) {
                return;
            }
            const options: ParamsStreamScrcpy = {
                udid,
                ws,
                player: '',
                action: ACTION.STREAM_SCRCPY,
                secure,
                hostname,
                port,
                pathname,
                useProxy,
            };
            const dialog = new ConfigureScrcpy(this, descriptor, options);
            const onDialogClosed = (event: { dialog: ConfigureScrcpy; result: boolean }) => {
                dialog.off('closed', onDialogClosed);
                if (event.result) {
                    // Remove the devices holder completely when stream starts
                    const holder = document.getElementById('devices');
                    if (holder) {
                        holder.remove();
                    }
                    HostTracker.getInstance().destroy();
                }
            };
            dialog.on('closed', onDialogClosed);
            return;
        }

        const action = ACTION.STREAM_SCRCPY;

        const link = DeviceTracker.buildLink(
            {
                action,
                udid,
                player: playerCodeName,
                ws,
            },
            'View Stream',
            { action: ACTION.GOOG_DEVICE_LIST, secure, hostname, port, pathname, useProxy, type: 'android' },
        );

        // Navigate to the stream
        if (link instanceof HTMLAnchorElement) {
            link.click();
        }
    };

    protected getChannelCode(): string {
        return ChannelCode.GTRC;
    }

    public destroy(): void {
        super.destroy();
        DeviceTracker.instancesByUrl.delete(this.url.toString());
        if (!DeviceTracker.instancesByUrl.size) {
            const holder = document.getElementById(BaseDeviceTracker.HOLDER_ELEMENT_ID);
            if (holder && holder.parentElement) {
                holder.parentElement.removeChild(holder);
            }
        }
    }
}
