export enum WorkflowActionType {
    TAP = 'tap',
    SWIPE = 'swipe',
    TEXT = 'text',
    KEYCODE = 'keycode',
    COMMAND = 'command',
}

export interface PositionData {
    point: { x: number; y: number };
    screenSize: { width: number; height: number };
}

export interface WorkflowActionBase {
    type: WorkflowActionType;
    timestamp: number; // ms from workflow start
}

export interface TapAction extends WorkflowActionBase {
    type: WorkflowActionType.TAP;
    position: PositionData;
    duration: number; // ms between DOWN and UP
}

export interface SwipeAction extends WorkflowActionBase {
    type: WorkflowActionType.SWIPE;
    startPosition: PositionData;
    endPosition: PositionData;
    duration: number;
    intermediatePoints?: { position: PositionData; relativeTime: number }[];
}

export interface TextAction extends WorkflowActionBase {
    type: WorkflowActionType.TEXT;
    text: string;
}

export interface KeyCodeAction extends WorkflowActionBase {
    type: WorkflowActionType.KEYCODE;
    keycode: number;
    keyName?: string; // Human-readable name like "Home", "Back", "Power"
}

export interface CommandAction extends WorkflowActionBase {
    type: WorkflowActionType.COMMAND;
    commandType: number;
    commandName?: string; // Human-readable name
}

export type WorkflowAction = TapAction | SwipeAction | TextAction | KeyCodeAction | CommandAction;

export interface Workflow {
    id: string;
    name: string;
    description?: string;
    createdAt: number;
    updatedAt: number;
    screenSize: { width: number; height: number };
    actions: WorkflowAction[];
}
