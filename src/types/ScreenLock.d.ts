export type LockType = 'user' | 'workflow';

export interface LockInfo {
    type: LockType;
    lockHolderId: string; // clientId for user, workflowId for workflow
    lockHolderName: string; // displayName or workflow name
    ownerClientId?: string; // clientId that initiated the lock (for workflow locks)
    acquiredAt: number;
}

export interface LockStateMessage {
    type: 'lockState';
    udid: string;
    displayId: number;
    lock: LockInfo | null;
    isLockHolder: boolean;
}

export interface LockRequestMessage {
    type: 'lockRequest';
    action: 'acquire' | 'release' | 'forceUnlock' | 'emergencyUnlock';
    lockType?: LockType;
    workflowId?: string;
    workflowName?: string;
}
