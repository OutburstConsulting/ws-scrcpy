import { ControlMessage } from '../controlMessage/ControlMessage';
import { TouchControlMessage } from '../controlMessage/TouchControlMessage';
import { TextControlMessage } from '../controlMessage/TextControlMessage';
import { KeyCodeControlMessage } from '../controlMessage/KeyCodeControlMessage';
import { CommandControlMessage } from '../controlMessage/CommandControlMessage';
import MotionEvent from '../MotionEvent';
import KeyEvent from '../googDevice/android/KeyEvent';
import {
    Workflow,
    WorkflowAction,
    WorkflowActionType,
    TapAction,
    SwipeAction,
    TextAction,
    KeyCodeAction,
    CommandAction,
    PositionData,
} from './WorkflowTypes';
import { WorkflowStorage } from './WorkflowStorage';

// Map keycodes to human-readable names
const KEYCODE_NAMES: Record<number, string> = {
    [KeyEvent.KEYCODE_HOME]: 'Home',
    [KeyEvent.KEYCODE_BACK]: 'Back',
    [KeyEvent.KEYCODE_POWER]: 'Power',
    [KeyEvent.KEYCODE_VOLUME_UP]: 'Volume Up',
    [KeyEvent.KEYCODE_VOLUME_DOWN]: 'Volume Down',
    [KeyEvent.KEYCODE_MENU]: 'Menu',
    [KeyEvent.KEYCODE_APP_SWITCH]: 'App Switch',
};

// Map command types to human-readable names
const COMMAND_NAMES: Record<number, string> = {
    [ControlMessage.TYPE_EXPAND_NOTIFICATION_PANEL]: 'Expand Notifications',
    [ControlMessage.TYPE_EXPAND_SETTINGS_PANEL]: 'Expand Settings',
    [ControlMessage.TYPE_COLLAPSE_PANELS]: 'Collapse Panels',
    [ControlMessage.TYPE_ROTATE_DEVICE]: 'Rotate Device',
    [ControlMessage.TYPE_BACK_OR_SCREEN_ON]: 'Back/Screen On',
};

interface TouchState {
    startTime: number;
    startPosition: PositionData;
    moves: { position: PositionData; time: number }[];
}

export type RecorderStateCallback = (recording: boolean) => void;

export class WorkflowRecorder {
    private isRecording = false;
    private recordingStartTime = 0;
    private actions: WorkflowAction[] = [];
    private screenSize: { width: number; height: number } = { width: 0, height: 0 };
    private currentTouchState: TouchState | null = null;
    private stateCallback?: RecorderStateCallback;
    private readonly deviceId: string;

    // Threshold to distinguish tap from swipe (pixels)
    private static readonly SWIPE_THRESHOLD = 10;

    constructor(deviceId: string, stateCallback?: RecorderStateCallback) {
        this.deviceId = deviceId;
        this.stateCallback = stateCallback;
    }

    public startRecording(screenWidth: number, screenHeight: number): void {
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.actions = [];
        this.screenSize = { width: screenWidth, height: screenHeight };
        this.currentTouchState = null;
        this.stateCallback?.(true);
    }

    public stopRecording(): Workflow | null {
        if (!this.isRecording) return null;
        this.isRecording = false;
        this.stateCallback?.(false);

        if (this.actions.length === 0) return null;

        const workflow: Workflow = {
            id: WorkflowStorage.generateId(),
            deviceId: this.deviceId,
            name: `Workflow ${new Date().toLocaleString()}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            screenSize: this.screenSize,
            actions: this.actions,
        };
        return workflow;
    }

    public isActive(): boolean {
        return this.isRecording;
    }

    public getActionCount(): number {
        return this.actions.length;
    }

    public recordMessage(message: ControlMessage): void {
        if (!this.isRecording) return;

        if (message instanceof TouchControlMessage) {
            this.handleTouchMessage(message);
        } else if (message instanceof TextControlMessage) {
            this.handleTextMessage(message);
        } else if (message instanceof KeyCodeControlMessage) {
            this.handleKeyCodeMessage(message);
        } else if (message instanceof CommandControlMessage) {
            this.handleCommandMessage(message);
        }
    }

    private handleTouchMessage(message: TouchControlMessage): void {
        const currentTime = Date.now();
        const relativeTime = currentTime - this.recordingStartTime;

        // Only handle pointerId 0 (single touch, no multi-touch)
        if (message.pointerId !== 0) return;

        const positionData: PositionData = {
            point: { x: message.position.point.x, y: message.position.point.y },
            screenSize: {
                width: message.position.screenSize.width,
                height: message.position.screenSize.height,
            },
        };

        if (message.action === MotionEvent.ACTION_DOWN) {
            this.currentTouchState = {
                startTime: currentTime,
                startPosition: positionData,
                moves: [],
            };
        } else if (message.action === MotionEvent.ACTION_MOVE && this.currentTouchState) {
            this.currentTouchState.moves.push({
                position: positionData,
                time: currentTime - this.currentTouchState.startTime,
            });
        } else if (message.action === MotionEvent.ACTION_UP && this.currentTouchState) {
            const endPosition = positionData;
            const duration = currentTime - this.currentTouchState.startTime;
            const distance = this.calculateDistance(this.currentTouchState.startPosition.point, endPosition.point);

            const actionTimestamp = relativeTime - duration;

            if (distance < WorkflowRecorder.SWIPE_THRESHOLD) {
                // It's a tap
                const action: TapAction = {
                    type: WorkflowActionType.TAP,
                    timestamp: actionTimestamp,
                    position: this.currentTouchState.startPosition,
                    duration,
                };
                this.actions.push(action);
            } else {
                // It's a swipe
                const action: SwipeAction = {
                    type: WorkflowActionType.SWIPE,
                    timestamp: actionTimestamp,
                    startPosition: this.currentTouchState.startPosition,
                    endPosition,
                    duration,
                    intermediatePoints: this.currentTouchState.moves.map((m) => ({
                        position: m.position,
                        relativeTime: m.time,
                    })),
                };
                this.actions.push(action);
            }
            this.currentTouchState = null;
        }
    }

    private handleTextMessage(message: TextControlMessage): void {
        const action: TextAction = {
            type: WorkflowActionType.TEXT,
            timestamp: Date.now() - this.recordingStartTime,
            text: message.text,
        };
        this.actions.push(action);
    }

    private handleKeyCodeMessage(message: KeyCodeControlMessage): void {
        // Only record key down events to avoid duplicates (down + up)
        if (message.action !== MotionEvent.ACTION_DOWN) return;

        const action: KeyCodeAction = {
            type: WorkflowActionType.KEYCODE,
            timestamp: Date.now() - this.recordingStartTime,
            keycode: message.keycode,
            keyName: KEYCODE_NAMES[message.keycode] || `Key ${message.keycode}`,
        };
        this.actions.push(action);
    }

    private handleCommandMessage(message: CommandControlMessage): void {
        // Skip certain command types that shouldn't be recorded
        const skipTypes = [
            ControlMessage.TYPE_CHANGE_STREAM_PARAMETERS,
            ControlMessage.TYPE_PUSH_FILE,
            ControlMessage.TYPE_GET_CLIPBOARD,
            ControlMessage.TYPE_SET_CLIPBOARD,
            ControlMessage.TYPE_SET_SCREEN_POWER_MODE,
        ];
        if (skipTypes.includes(message.type)) return;

        const action: CommandAction = {
            type: WorkflowActionType.COMMAND,
            timestamp: Date.now() - this.recordingStartTime,
            commandType: message.type,
            commandName: COMMAND_NAMES[message.type] || `Command ${message.type}`,
        };
        this.actions.push(action);
    }

    private calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
