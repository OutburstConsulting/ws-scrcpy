import { LockStateInfo } from '../client/StreamReceiver';

export type ForceUnlockCallback = () => void;
export type EmergencyUnlockCallback = () => void;

export class ScreenLockOverlay {
    private readonly overlay: HTMLElement;
    private readonly infoPanel: HTMLElement;
    private readonly lockIcon: HTMLElement;
    private readonly statusText: HTMLElement;
    private readonly holderText: HTMLElement;
    private readonly forceUnlockButton: HTMLElement;
    private readonly emergencyUnlockButton: HTMLElement;
    private forceUnlockCallback?: ForceUnlockCallback;
    private emergencyUnlockCallback?: EmergencyUnlockCallback;

    constructor(parent: HTMLElement) {
        // Create overlay container
        this.overlay = document.createElement('div');
        this.overlay.className = 'screen-lock-overlay';

        // Create info panel
        this.infoPanel = document.createElement('div');
        this.infoPanel.className = 'screen-lock-info';

        // Lock icon
        this.lockIcon = document.createElement('sl-icon');
        this.lockIcon.setAttribute('name', 'lock-fill');
        this.lockIcon.className = 'screen-lock-icon';
        this.infoPanel.appendChild(this.lockIcon);

        // Status text
        this.statusText = document.createElement('div');
        this.statusText.className = 'screen-lock-status';
        this.statusText.textContent = 'Screen is locked';
        this.infoPanel.appendChild(this.statusText);

        // Holder text
        this.holderText = document.createElement('div');
        this.holderText.className = 'screen-lock-holder';
        this.infoPanel.appendChild(this.holderText);

        // Force unlock button (for user locks)
        this.forceUnlockButton = document.createElement('sl-button');
        this.forceUnlockButton.setAttribute('variant', 'primary');
        this.forceUnlockButton.setAttribute('size', 'medium');
        this.forceUnlockButton.className = 'screen-lock-force-unlock';
        this.forceUnlockButton.innerHTML =
            '<sl-icon name="unlock-fill" slot="prefix" style="margin-right: 5px;"></sl-icon>Take Control';
        this.forceUnlockButton.addEventListener('click', () => this.onForceUnlockClick());
        this.infoPanel.appendChild(this.forceUnlockButton);

        // Emergency unlock button (for workflow locks)
        this.emergencyUnlockButton = document.createElement('sl-button');
        this.emergencyUnlockButton.setAttribute('variant', 'danger');
        this.emergencyUnlockButton.setAttribute('size', 'medium');
        this.emergencyUnlockButton.className = 'screen-lock-emergency-unlock';
        this.emergencyUnlockButton.innerHTML =
            '<sl-icon name="exclamation-triangle-fill" slot="prefix" style="margin-right: 5px;"></sl-icon>Emergency Stop';
        this.emergencyUnlockButton.addEventListener('click', () => this.onEmergencyUnlockClick());
        this.infoPanel.appendChild(this.emergencyUnlockButton);

        this.overlay.appendChild(this.infoPanel);
        parent.appendChild(this.overlay);

        // Start hidden
        this.hide();
    }

    public setForceUnlockCallback(callback: ForceUnlockCallback): void {
        this.forceUnlockCallback = callback;
    }

    public setEmergencyUnlockCallback(callback: EmergencyUnlockCallback): void {
        this.emergencyUnlockCallback = callback;
    }

    public show(lockState: LockStateInfo): void {
        this.overlay.style.display = 'flex';
        this.updateStatus(lockState);
    }

    public hide(): void {
        this.overlay.style.display = 'none';
    }

    public updateStatus(lockState: LockStateInfo): void {
        if (!lockState.lock) {
            this.hide();
            return;
        }

        const { lock } = lockState;
        const isWorkflowLock = lock.type === 'workflow';

        // Update icon based on lock type
        if (isWorkflowLock) {
            this.lockIcon.setAttribute('name', 'play-circle-fill');
            this.statusText.textContent = 'Workflow in progress';
        } else {
            this.lockIcon.setAttribute('name', 'lock-fill');
            this.statusText.textContent = 'Screen is locked';
        }

        // Update holder info
        this.holderText.textContent = `Controlled by: ${lock.lockHolderName}`;

        // Show appropriate button based on lock type
        if (isWorkflowLock) {
            this.forceUnlockButton.style.display = 'none';
            this.emergencyUnlockButton.style.display = '';
        } else {
            this.forceUnlockButton.style.display = '';
            this.emergencyUnlockButton.style.display = 'none';
        }
    }

    private onForceUnlockClick(): void {
        if (this.forceUnlockCallback) {
            this.forceUnlockCallback();
        }
    }

    private onEmergencyUnlockClick(): void {
        if (this.emergencyUnlockCallback) {
            this.emergencyUnlockCallback();
        }
    }

    public destroy(): void {
        this.overlay.remove();
    }
}
