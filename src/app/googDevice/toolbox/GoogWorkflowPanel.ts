import { BasePlayer } from '../../player/BasePlayer';
import { WorkflowRecorder } from '../../workflow/WorkflowRecorder';
import { WorkflowPlayer, WorkflowPlayerListener, ActionFeedback } from '../../workflow/WorkflowPlayer';
import { WorkflowStorage } from '../../workflow/WorkflowStorage';
import { Workflow } from '../../workflow/WorkflowTypes';
import { DraggablePanel } from '../../ui/DraggablePanel';
import { LockStateInfo, LockRequestInfo } from '../../client/StreamReceiver';

export type LockRequestCallback = (request: LockRequestInfo) => void;

export class GoogWorkflowPanel {
    private readonly holder: HTMLElement;
    private readonly workflowListContainer: HTMLElement;
    private readonly recordButton: HTMLElement;
    private readonly statusBadge: HTMLElement;
    private readonly fileInput: HTMLInputElement;
    private feedbackOverlay: HTMLElement | null = null;
    private draggable: DraggablePanel;
    private editingWorkflowId: string | null = null;
    private playingWorkflowId: string | null = null;

    private recorder: WorkflowRecorder;
    private player: WorkflowPlayer;
    private readonly deviceId: string;
    private lockRequestCallback?: LockRequestCallback;
    private pendingWorkflow: Workflow | null = null;
    private hasWorkflowLock = false;

    constructor(udid: string, private basePlayer: BasePlayer, listener: WorkflowPlayerListener) {
        this.deviceId = udid;
        // Create recorder and player
        this.recorder = new WorkflowRecorder(this.deviceId, (recording) => this.onRecordingStateChange(recording));
        this.player = new WorkflowPlayer(
            listener,
            (playing, name) => this.onPlayingStateChange(playing, name),
            (feedback) => this.onActionFeedback(feedback),
        );

        // Create main panel container
        const panel = document.createElement('sl-card');
        panel.className = 'workflow-panel';

        // Header with title and status badge (also serves as drag handle)
        const header = document.createElement('div');
        header.className = 'workflow-panel-header';
        header.slot = 'header';

        const dragIcon = document.createElement('sl-icon');
        dragIcon.setAttribute('name', 'grip-horizontal');
        dragIcon.style.marginRight = '8px';
        dragIcon.style.opacity = '0.5';
        header.appendChild(dragIcon);

        const title = document.createElement('span');
        title.textContent = 'Workflows';
        header.appendChild(title);

        this.statusBadge = document.createElement('sl-badge');
        this.statusBadge.setAttribute('variant', 'neutral');
        this.statusBadge.style.display = 'none';
        this.statusBadge.style.marginLeft = '8px';
        header.appendChild(this.statusBadge);

        panel.appendChild(header);

        // Initialize draggable after panel is set up
        this.draggable = new DraggablePanel(panel, header);

        // Button container for record and import
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: space-between; margin-bottom: 0.5rem;';

        // Record button
        this.recordButton = document.createElement('sl-button');
        this.recordButton.setAttribute('variant', 'primary');
        this.recordButton.setAttribute('size', 'small');
        this.recordButton.innerHTML =
            '<sl-icon name="record-circle" slot="prefix" style="margin-right: 5px;"></sl-icon>Start Recording';
        this.recordButton.addEventListener('click', () => this.toggleRecording());
        buttonContainer.appendChild(this.recordButton);

        // Import button
        const importButton = document.createElement('sl-button');
        importButton.setAttribute('variant', 'neutral');
        importButton.setAttribute('size', 'small');
        importButton.innerHTML = '<sl-icon name="upload" slot="prefix" style="margin-right: 5px;"></sl-icon>Import';
        importButton.addEventListener('click', () => this.fileInput.click());
        buttonContainer.appendChild(importButton);

        panel.appendChild(buttonContainer);

        // Hidden file input for import
        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = '.json';
        this.fileInput.style.display = 'none';
        this.fileInput.addEventListener('change', (e) => this.handleImport(e));
        panel.appendChild(this.fileInput);

        // Divider
        const divider = document.createElement('sl-divider');
        panel.appendChild(divider);

        // Workflow list
        this.workflowListContainer = document.createElement('div');
        this.workflowListContainer.className = 'workflow-list';
        panel.appendChild(this.workflowListContainer);

        this.holder = panel;
        this.refreshWorkflowList();
    }

    private async toggleRecording(): Promise<void> {
        if (this.recorder.isActive()) {
            const workflow = this.recorder.stopRecording();
            if (workflow) {
                // Save immediately with default name
                await WorkflowStorage.save(workflow);
                // Refresh list and start editing the new workflow's name
                await this.refreshWorkflowList();
                this.startEditingWorkflow(workflow.id);
            }
        } else {
            const screenInfo = this.basePlayer.getScreenInfo();
            if (screenInfo) {
                const { width, height } = screenInfo.videoSize;
                this.recorder.startRecording(width, height);
            }
        }
    }

    private onRecordingStateChange(recording: boolean): void {
        if (recording) {
            this.recordButton.innerHTML =
                '<sl-icon name="stop-fill" slot="prefix" style="margin-right: 5px;"></sl-icon>Stop Recording';
            this.recordButton.setAttribute('variant', 'danger');
            this.statusBadge.textContent = 'Recording';
            this.statusBadge.setAttribute('variant', 'danger');
            this.statusBadge.setAttribute('pulse', '');
            this.statusBadge.style.display = '';
        } else {
            this.recordButton.innerHTML =
                '<sl-icon name="record-circle" slot="prefix" style="margin-right: 5px;"></sl-icon>Start Recording';
            this.recordButton.setAttribute('variant', 'primary');
            this.statusBadge.style.display = 'none';
            this.statusBadge.removeAttribute('pulse');
        }
    }

    private onPlayingStateChange(playing: boolean, workflowName?: string): void {
        if (playing) {
            this.statusBadge.textContent = `Playing: ${workflowName}`;
            this.statusBadge.setAttribute('variant', 'success');
            this.statusBadge.setAttribute('pulse', '');
            this.statusBadge.style.display = '';
            this.recordButton.setAttribute('disabled', '');
            this.createFeedbackOverlay();
        } else {
            this.statusBadge.style.display = 'none';
            this.statusBadge.removeAttribute('pulse');
            this.recordButton.removeAttribute('disabled');
            this.removeFeedbackOverlay();
            // Release workflow lock when playback ends
            this.releaseWorkflowLock();
            this.playingWorkflowId = null;
            this.pendingWorkflow = null;
            this.refreshWorkflowList();
        }
    }

    private onActionFeedback(feedback: ActionFeedback): void {
        // Update status badge with progress
        const progress = `${feedback.actionIndex + 1}/${feedback.totalActions}`;
        let actionDesc = '';
        switch (feedback.type) {
            case 'tap':
                actionDesc = `Tap at (${feedback.position?.x}, ${feedback.position?.y})`;
                if (feedback.position) {
                    this.showTapIndicator(feedback.position.x, feedback.position.y);
                }
                break;
            case 'swipe':
                actionDesc = 'Swipe';
                if (feedback.position && feedback.endPosition) {
                    this.showSwipeIndicator(
                        feedback.position.x,
                        feedback.position.y,
                        feedback.endPosition.x,
                        feedback.endPosition.y,
                    );
                }
                break;
            case 'text':
                actionDesc = `Text: "${feedback.text?.substring(0, 20)}${
                    (feedback.text?.length || 0) > 20 ? '...' : ''
                }"`;
                this.showTextIndicator(feedback.text || '');
                break;
            case 'keycode':
                actionDesc = `Key: ${feedback.keyName}`;
                this.showButtonIndicator(feedback.keyName || 'Key');
                break;
            case 'command':
                actionDesc = `${feedback.commandName}`;
                this.showButtonIndicator(feedback.commandName || 'Command');
                break;
        }
        this.statusBadge.textContent = `[${progress}] ${actionDesc}`;
    }

    private createFeedbackOverlay(): void {
        if (this.feedbackOverlay) return;

        const touchableElement = this.basePlayer.getTouchableElement();
        const parent = touchableElement.parentElement;
        if (!parent) return;

        this.feedbackOverlay = document.createElement('div');
        this.feedbackOverlay.className = 'workflow-feedback-overlay';
        this.feedbackOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 10;
        `;
        parent.appendChild(this.feedbackOverlay);
    }

    private removeFeedbackOverlay(): void {
        if (this.feedbackOverlay) {
            this.feedbackOverlay.remove();
            this.feedbackOverlay = null;
        }
    }

    private showTapIndicator(x: number, y: number): void {
        if (!this.feedbackOverlay) return;

        const indicator = document.createElement('div');
        indicator.className = 'workflow-tap-indicator';
        indicator.style.cssText = `
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: 40px;
            height: 40px;
            margin-left: -20px;
            margin-top: -20px;
            border-radius: 50%;
            background: rgba(76, 175, 80, 0.5);
            border: 3px solid #4CAF50;
            animation: workflow-tap-pulse 0.5s ease-out forwards;
        `;
        this.feedbackOverlay.appendChild(indicator);

        // Remove after animation
        setTimeout(() => indicator.remove(), 500);
    }

    private showSwipeIndicator(startX: number, startY: number, endX: number, endY: number): void {
        if (!this.feedbackOverlay) return;

        // Start point
        const startIndicator = document.createElement('div');
        startIndicator.style.cssText = `
            position: absolute;
            left: ${startX}px;
            top: ${startY}px;
            width: 30px;
            height: 30px;
            margin-left: -15px;
            margin-top: -15px;
            border-radius: 50%;
            background: rgba(33, 150, 243, 0.5);
            border: 3px solid #2196F3;
        `;
        this.feedbackOverlay.appendChild(startIndicator);

        // Line connecting start to end
        const length = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
        const angle = Math.atan2(endY - startY, endX - startX) * (180 / Math.PI);
        const line = document.createElement('div');
        line.style.cssText = `
            position: absolute;
            left: ${startX}px;
            top: ${startY}px;
            width: ${length}px;
            height: 4px;
            background: linear-gradient(90deg, #2196F3, #4CAF50);
            transform-origin: left center;
            transform: rotate(${angle}deg);
            opacity: 0.7;
        `;
        this.feedbackOverlay.appendChild(line);

        // End point
        const endIndicator = document.createElement('div');
        endIndicator.style.cssText = `
            position: absolute;
            left: ${endX}px;
            top: ${endY}px;
            width: 30px;
            height: 30px;
            margin-left: -15px;
            margin-top: -15px;
            border-radius: 50%;
            background: rgba(76, 175, 80, 0.5);
            border: 3px solid #4CAF50;
        `;
        this.feedbackOverlay.appendChild(endIndicator);

        // Remove after animation
        setTimeout(() => {
            startIndicator.remove();
            line.remove();
            endIndicator.remove();
        }, 800);
    }

    private showTextIndicator(text: string): void {
        if (!this.feedbackOverlay) return;

        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            padding: 10px 20px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            border-radius: 8px;
            font-size: 14px;
            max-width: 80%;
            text-align: center;
            word-break: break-word;
        `;
        indicator.textContent = `Typing: "${text}"`;
        this.feedbackOverlay.appendChild(indicator);

        setTimeout(() => indicator.remove(), 1000);
    }

    private showButtonIndicator(buttonName: string): void {
        if (!this.feedbackOverlay) return;

        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            background: rgba(156, 39, 176, 0.9);
            color: white;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
            animation: workflow-button-pulse 0.3s ease-out;
        `;
        indicator.textContent = buttonName;
        this.feedbackOverlay.appendChild(indicator);

        setTimeout(() => indicator.remove(), 600);
    }

    private async refreshWorkflowList(): Promise<void> {
        this.workflowListContainer.innerHTML = '';
        const workflows = await WorkflowStorage.loadAll(this.deviceId);

        if (workflows.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'workflow-empty';
            empty.textContent = 'No saved workflows';
            this.workflowListContainer.appendChild(empty);
            return;
        }

        workflows.forEach((workflow) => {
            const item = this.createWorkflowItem(workflow);
            this.workflowListContainer.appendChild(item);
        });
    }

    private startEditingWorkflow(workflowId: string): void {
        this.editingWorkflowId = workflowId;
        this.refreshWorkflowList();
    }

    private createWorkflowItem(workflow: Workflow): HTMLElement {
        const item = document.createElement('div');
        item.className = 'workflow-item';

        const info = document.createElement('div');
        info.className = 'workflow-item-info';

        const isEditing = this.editingWorkflowId === workflow.id;

        if (isEditing) {
            // Editable name input
            const nameInput = document.createElement('sl-input');
            nameInput.setAttribute('size', 'small');
            nameInput.setAttribute('value', workflow.name);
            nameInput.className = 'workflow-item-name-input';
            nameInput.style.cssText = 'margin-bottom: 4px;';

            // Save on enter or blur
            const saveEdit = async () => {
                const newName = (nameInput as unknown as { value: string }).value.trim();
                if (newName && newName !== workflow.name) {
                    workflow.name = newName;
                    workflow.deviceId = this.deviceId;
                    await WorkflowStorage.save(workflow);
                }
                this.editingWorkflowId = null;
                await this.refreshWorkflowList();
            };

            nameInput.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    saveEdit();
                } else if (e.key === 'Escape') {
                    this.editingWorkflowId = null;
                    this.refreshWorkflowList();
                }
            });

            nameInput.addEventListener('sl-blur', () => {
                // Small delay to allow click on save button
                setTimeout(() => {
                    if (this.editingWorkflowId === workflow.id) {
                        saveEdit();
                    }
                }, 150);
            });

            info.appendChild(nameInput);

            // Focus the input after it's added to DOM
            setTimeout(() => {
                const input = nameInput.shadowRoot?.querySelector('input');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 50);
        } else {
            // Display name (click to edit)
            const name = document.createElement('div');
            name.className = 'workflow-item-name';
            name.textContent = workflow.name;
            name.style.cursor = 'pointer';
            name.title = 'Click to rename';
            name.addEventListener('click', () => {
                this.startEditingWorkflow(workflow.id);
            });
            info.appendChild(name);
        }

        const meta = document.createElement('div');
        meta.className = 'workflow-item-meta';
        meta.textContent = `${workflow.actions.length} actions`;
        info.appendChild(meta);

        item.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'workflow-item-actions';

        const isPlaying = this.playingWorkflowId === workflow.id;

        if (!isEditing) {
            if (isPlaying) {
                // Spinner when playing
                const spinner = document.createElement('sl-spinner');
                spinner.style.cssText = 'font-size: 1rem; margin-right: 4px;';
                actions.appendChild(spinner);

                // Stop button when playing
                const stopBtn = document.createElement('sl-tooltip');
                stopBtn.setAttribute('content', 'Stop workflow');
                const stopIcon = document.createElement('sl-icon-button');
                stopIcon.setAttribute('name', 'stop-fill');
                stopIcon.setAttribute('label', 'Stop');
                stopIcon.style.color = 'var(--sl-color-danger-600)';
                stopIcon.addEventListener('click', () => this.stopWorkflow());
                stopBtn.appendChild(stopIcon);
                actions.appendChild(stopBtn);
            } else {
                // Play button
                const playBtn = document.createElement('sl-tooltip');
                playBtn.setAttribute('content', 'Play workflow');
                const playIcon = document.createElement('sl-icon-button');
                playIcon.setAttribute('name', 'play-fill');
                playIcon.setAttribute('label', 'Play');
                // Disable if another workflow is playing
                if (this.playingWorkflowId) {
                    playIcon.setAttribute('disabled', '');
                }
                playIcon.addEventListener('click', () => this.playWorkflow(workflow));
                playBtn.appendChild(playIcon);
                actions.appendChild(playBtn);
            }

            // Edit button (disabled when any workflow is playing)
            const editBtn = document.createElement('sl-tooltip');
            editBtn.setAttribute('content', 'Rename workflow');
            const editIcon = document.createElement('sl-icon-button');
            editIcon.setAttribute('name', 'pencil');
            editIcon.setAttribute('label', 'Rename');
            if (this.playingWorkflowId) {
                editIcon.setAttribute('disabled', '');
            }
            editIcon.addEventListener('click', () => this.startEditingWorkflow(workflow.id));
            editBtn.appendChild(editIcon);
            actions.appendChild(editBtn);

            // Export button (disabled when any workflow is playing)
            const exportBtn = document.createElement('sl-tooltip');
            exportBtn.setAttribute('content', 'Export workflow');
            const exportIcon = document.createElement('sl-icon-button');
            exportIcon.setAttribute('name', 'download');
            exportIcon.setAttribute('label', 'Export');
            if (this.playingWorkflowId) {
                exportIcon.setAttribute('disabled', '');
            }
            exportIcon.addEventListener('click', () => this.exportWorkflow(workflow));
            exportBtn.appendChild(exportIcon);
            actions.appendChild(exportBtn);

            // Delete button (disabled when any workflow is playing)
            const deleteBtn = document.createElement('sl-tooltip');
            deleteBtn.setAttribute('content', 'Delete workflow');
            const deleteIcon = document.createElement('sl-icon-button');
            deleteIcon.setAttribute('name', 'trash');
            deleteIcon.setAttribute('label', 'Delete');
            if (this.playingWorkflowId) {
                deleteIcon.setAttribute('disabled', '');
            }
            deleteIcon.addEventListener('click', async () => {
                if (confirm(`Delete "${workflow.name}"?`)) {
                    await WorkflowStorage.delete(workflow.id, this.deviceId);
                    await this.refreshWorkflowList();
                }
            });
            deleteBtn.appendChild(deleteIcon);
            actions.appendChild(deleteBtn);
        } else {
            // Save button when editing
            const saveBtn = document.createElement('sl-tooltip');
            saveBtn.setAttribute('content', 'Save name');
            const saveIcon = document.createElement('sl-icon-button');
            saveIcon.setAttribute('name', 'check-lg');
            saveIcon.setAttribute('label', 'Save');
            saveIcon.addEventListener('click', async () => {
                const nameInput = info.querySelector('sl-input') as unknown as { value: string } | null;
                if (nameInput) {
                    const newName = nameInput.value.trim();
                    if (newName) {
                        workflow.name = newName;
                        workflow.deviceId = this.deviceId;
                        await WorkflowStorage.save(workflow);
                    }
                }
                this.editingWorkflowId = null;
                await this.refreshWorkflowList();
            });
            saveBtn.appendChild(saveIcon);
            actions.appendChild(saveBtn);

            // Cancel button when editing
            const cancelBtn = document.createElement('sl-tooltip');
            cancelBtn.setAttribute('content', 'Cancel');
            const cancelIcon = document.createElement('sl-icon-button');
            cancelIcon.setAttribute('name', 'x-lg');
            cancelIcon.setAttribute('label', 'Cancel');
            cancelIcon.addEventListener('click', () => {
                this.editingWorkflowId = null;
                this.refreshWorkflowList();
            });
            cancelBtn.appendChild(cancelIcon);
            actions.appendChild(cancelBtn);
        }

        item.appendChild(actions);
        return item;
    }

    private playWorkflow(workflow: Workflow): void {
        if (this.recorder.isActive() || this.player.isActive()) return;

        // Request workflow lock before starting playback
        if (this.lockRequestCallback) {
            this.pendingWorkflow = workflow;
            this.lockRequestCallback({
                type: 'lockRequest',
                action: 'acquire',
                lockType: 'workflow',
                workflowId: workflow.id,
                workflowName: workflow.name,
            });
        } else {
            // No lock callback, play directly
            this.startWorkflowPlayback(workflow);
        }
    }

    private startWorkflowPlayback(workflow: Workflow): void {
        const screenInfo = this.basePlayer.getScreenInfo();
        if (screenInfo) {
            this.playingWorkflowId = workflow.id;
            this.hasWorkflowLock = true;
            this.refreshWorkflowList();
            this.player.play(workflow, screenInfo.videoSize);
        }
    }

    private stopWorkflow(): void {
        this.player.stop();
        this.releaseWorkflowLock();
    }

    private releaseWorkflowLock(): void {
        if (this.hasWorkflowLock && this.playingWorkflowId && this.lockRequestCallback) {
            this.lockRequestCallback({
                type: 'lockRequest',
                action: 'release',
                lockType: 'workflow',
                workflowId: this.playingWorkflowId,
            });
            this.hasWorkflowLock = false;
        }
    }

    private exportWorkflow(workflow: Workflow): void {
        // Create a clean export object (without internal IDs if needed for portability)
        const exportData = {
            name: workflow.name,
            description: workflow.description,
            screenSize: workflow.screenSize,
            actions: workflow.actions,
            exportedAt: Date.now(),
            version: 1,
        };

        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Create download link and trigger download
        const link = document.createElement('a');
        link.href = url;
        link.download = `${workflow.name.replace(/[^a-z0-9]/gi, '_')}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    private async handleImport(event: Event): Promise<void> {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Validate the imported data
            if (!data.name || !data.actions || !Array.isArray(data.actions)) {
                alert('Invalid workflow file: missing required fields (name, actions)');
                return;
            }

            if (!data.screenSize || typeof data.screenSize.width !== 'number') {
                alert('Invalid workflow file: missing or invalid screenSize');
                return;
            }

            // Create a new workflow from the imported data
            const workflow: Workflow = {
                id: WorkflowStorage.generateId(),
                deviceId: this.deviceId,
                name: data.name,
                description: data.description,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                screenSize: data.screenSize,
                actions: data.actions,
            };

            await WorkflowStorage.save(workflow);
            await this.refreshWorkflowList();

            // Show success message
            this.showImportSuccess(workflow.name);
        } catch (error) {
            console.error('[WorkflowPanel] Import error:', error);
            alert('Failed to import workflow: Invalid JSON file');
        } finally {
            // Reset file input so the same file can be imported again
            input.value = '';
        }
    }

    private showImportSuccess(workflowName: string): void {
        this.statusBadge.textContent = `Imported: ${workflowName}`;
        this.statusBadge.setAttribute('variant', 'success');
        this.statusBadge.style.display = '';

        setTimeout(() => {
            this.statusBadge.style.display = 'none';
        }, 3000);
    }

    public getRecorder(): WorkflowRecorder {
        return this.recorder;
    }

    public getHolderElement(): HTMLElement {
        return this.holder;
    }

    public positionNear(element: HTMLElement): void {
        this.draggable.positionNear(element, 'left');
    }

    public setLockRequestCallback(callback: LockRequestCallback): void {
        this.lockRequestCallback = callback;
    }

    public setLockState(info: LockStateInfo): void {
        // If we have a pending workflow and we acquired the workflow lock, start playback
        if (this.pendingWorkflow && info.lock && info.lock.type === 'workflow' && info.isLockHolder) {
            const workflow = this.pendingWorkflow;
            this.pendingWorkflow = null;
            this.startWorkflowPlayback(workflow);
        }
    }
}
