import { ControlMessage } from '../controlMessage/ControlMessage';
import { TouchControlMessage } from '../controlMessage/TouchControlMessage';
import { TextControlMessage } from '../controlMessage/TextControlMessage';
import { KeyCodeControlMessage } from '../controlMessage/KeyCodeControlMessage';
import { CommandControlMessage } from '../controlMessage/CommandControlMessage';
import MotionEvent from '../MotionEvent';
import Position from '../Position';
import Point from '../Point';
import Size from '../Size';
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

export interface WorkflowPlayerListener {
    sendMessage(message: ControlMessage): void;
}

export type PlayerStateCallback = (playing: boolean, workflowName?: string) => void;

export interface ActionFeedback {
    type: 'tap' | 'swipe' | 'text' | 'keycode' | 'command';
    actionIndex: number;
    totalActions: number;
    position?: { x: number; y: number };
    endPosition?: { x: number; y: number };
    text?: string;
    keyName?: string;
    commandName?: string;
}

export type ActionCallback = (feedback: ActionFeedback) => void;

export class WorkflowPlayer {
    private isPlaying = false;
    private currentWorkflow: Workflow | null = null;
    private timeouts: number[] = [];
    private stateCallback?: PlayerStateCallback;
    private actionCallback?: ActionCallback;

    constructor(
        private listener: WorkflowPlayerListener,
        stateCallback?: PlayerStateCallback,
        actionCallback?: ActionCallback,
    ) {
        this.stateCallback = stateCallback;
        this.actionCallback = actionCallback;
    }

    public play(workflow: Workflow, currentScreenSize: Size): void {
        if (this.isPlaying) this.stop();

        this.currentWorkflow = workflow;
        this.isPlaying = true;
        this.timeouts = [];
        this.stateCallback?.(true, workflow.name);

        this.scheduleAllActions(currentScreenSize);
    }

    public stop(): void {
        this.timeouts.forEach((t) => clearTimeout(t));
        this.timeouts = [];
        this.isPlaying = false;
        this.currentWorkflow = null;
        this.stateCallback?.(false);
    }

    public isActive(): boolean {
        return this.isPlaying;
    }

    private scheduleAllActions(screenSize: Size): void {
        if (!this.currentWorkflow) return;

        this.currentWorkflow.actions.forEach((action, index) => {
            const timeout = window.setTimeout(() => {
                this.executeAction(action, screenSize, index);
                if (index === this.currentWorkflow!.actions.length - 1) {
                    // Last action completed - add small delay before stopping
                    const stopTimeout = window.setTimeout(() => this.stop(), 500);
                    this.timeouts.push(stopTimeout);
                }
            }, action.timestamp);
            this.timeouts.push(timeout);
        });
    }

    private executeAction(action: WorkflowAction, currentScreenSize: Size, index: number): void {
        const totalActions = this.currentWorkflow?.actions.length || 0;

        switch (action.type) {
            case WorkflowActionType.TAP: {
                const pos = this.scalePosition(action.position, currentScreenSize);
                this.actionCallback?.({
                    type: 'tap',
                    actionIndex: index,
                    totalActions,
                    position: { x: pos.point.x, y: pos.point.y },
                });
                this.executeTap(action, currentScreenSize);
                break;
            }
            case WorkflowActionType.SWIPE: {
                const startPos = this.scalePosition(action.startPosition, currentScreenSize);
                const endPos = this.scalePosition(action.endPosition, currentScreenSize);
                this.actionCallback?.({
                    type: 'swipe',
                    actionIndex: index,
                    totalActions,
                    position: { x: startPos.point.x, y: startPos.point.y },
                    endPosition: { x: endPos.point.x, y: endPos.point.y },
                });
                this.executeSwipe(action, currentScreenSize);
                break;
            }
            case WorkflowActionType.TEXT:
                this.actionCallback?.({
                    type: 'text',
                    actionIndex: index,
                    totalActions,
                    text: action.text,
                });
                this.executeText(action);
                break;
            case WorkflowActionType.KEYCODE:
                this.actionCallback?.({
                    type: 'keycode',
                    actionIndex: index,
                    totalActions,
                    keyName: action.keyName,
                });
                this.executeKeyCode(action);
                break;
            case WorkflowActionType.COMMAND:
                this.actionCallback?.({
                    type: 'command',
                    actionIndex: index,
                    totalActions,
                    commandName: action.commandName,
                });
                this.executeCommand(action);
                break;
        }
    }

    private executeTap(action: TapAction, screenSize: Size): void {
        const position = this.scalePosition(action.position, screenSize);

        // Send DOWN
        const downMsg = new TouchControlMessage(MotionEvent.ACTION_DOWN, 0, position, 1.0, MotionEvent.BUTTON_PRIMARY);
        this.listener.sendMessage(downMsg);

        // Send UP after duration
        const timeout = window.setTimeout(() => {
            const upMsg = new TouchControlMessage(MotionEvent.ACTION_UP, 0, position, 0, MotionEvent.BUTTON_PRIMARY);
            this.listener.sendMessage(upMsg);
        }, action.duration);
        this.timeouts.push(timeout);
    }

    private executeSwipe(action: SwipeAction, screenSize: Size): void {
        const startPos = this.scalePosition(action.startPosition, screenSize);
        const endPos = this.scalePosition(action.endPosition, screenSize);

        // Send DOWN at start
        const downMsg = new TouchControlMessage(MotionEvent.ACTION_DOWN, 0, startPos, 1.0, MotionEvent.BUTTON_PRIMARY);
        this.listener.sendMessage(downMsg);

        // Send MOVE events
        if (action.intermediatePoints && action.intermediatePoints.length > 0) {
            action.intermediatePoints.forEach((point) => {
                const timeout = window.setTimeout(() => {
                    const pos = this.scalePosition(point.position, screenSize);
                    const moveMsg = new TouchControlMessage(
                        MotionEvent.ACTION_MOVE,
                        0,
                        pos,
                        1.0,
                        MotionEvent.BUTTON_PRIMARY,
                    );
                    this.listener.sendMessage(moveMsg);
                }, point.relativeTime);
                this.timeouts.push(timeout);
            });
        } else {
            // Linear interpolation for simple swipes
            const steps = 10;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                const x = Math.round(startPos.point.x + (endPos.point.x - startPos.point.x) * t);
                const y = Math.round(startPos.point.y + (endPos.point.y - startPos.point.y) * t);
                const pos = new Position(new Point(x, y), screenSize);

                const timeout = window.setTimeout(() => {
                    const moveMsg = new TouchControlMessage(
                        MotionEvent.ACTION_MOVE,
                        0,
                        pos,
                        1.0,
                        MotionEvent.BUTTON_PRIMARY,
                    );
                    this.listener.sendMessage(moveMsg);
                }, (action.duration / steps) * i);
                this.timeouts.push(timeout);
            }
        }

        // Send UP at end
        const timeout = window.setTimeout(() => {
            const upMsg = new TouchControlMessage(MotionEvent.ACTION_UP, 0, endPos, 0, MotionEvent.BUTTON_PRIMARY);
            this.listener.sendMessage(upMsg);
        }, action.duration);
        this.timeouts.push(timeout);
    }

    private executeText(action: TextAction): void {
        const textMsg = new TextControlMessage(action.text);
        this.listener.sendMessage(textMsg);
    }

    private executeKeyCode(action: KeyCodeAction): void {
        // Send key down
        const downMsg = new KeyCodeControlMessage(MotionEvent.ACTION_DOWN, action.keycode, 0, 0);
        this.listener.sendMessage(downMsg);

        // Send key up after a short delay
        const timeout = window.setTimeout(() => {
            const upMsg = new KeyCodeControlMessage(MotionEvent.ACTION_UP, action.keycode, 0, 0);
            this.listener.sendMessage(upMsg);
        }, 50);
        this.timeouts.push(timeout);
    }

    private executeCommand(action: CommandAction): void {
        const commandMsg = new CommandControlMessage(action.commandType);
        this.listener.sendMessage(commandMsg);
    }

    private scalePosition(pos: PositionData, currentScreenSize: Size): Position {
        const originalSize = this.currentWorkflow!.screenSize;
        const scaleX = currentScreenSize.width / originalSize.width;
        const scaleY = currentScreenSize.height / originalSize.height;

        const scaledX = Math.round(pos.point.x * scaleX);
        const scaledY = Math.round(pos.point.y * scaleY);

        return new Position(new Point(scaledX, scaledY), currentScreenSize);
    }
}
