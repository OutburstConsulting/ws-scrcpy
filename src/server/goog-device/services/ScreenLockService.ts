import { EventEmitter } from 'events';
import { Service } from '../../services/Service';
import { LockInfo } from '../../../types/ScreenLock';

export interface LockChangedEvent {
    udid: string;
    displayId: number;
    lock: LockInfo | null;
}

export class ScreenLockService extends EventEmitter implements Service {
    private static instance?: ScreenLockService;

    // Map: udid -> displayId -> LockInfo
    private locks: Map<string, Map<number, LockInfo>> = new Map();

    protected constructor() {
        super();
    }

    public static getInstance(): ScreenLockService {
        if (!this.instance) {
            this.instance = new ScreenLockService();
        }
        return this.instance;
    }

    public static hasInstance(): boolean {
        return !!ScreenLockService.instance;
    }

    /**
     * Acquire a user lock. Only succeeds if no lock exists.
     */
    public acquireUserLock(udid: string, displayId: number, clientId: string, displayName: string): boolean {
        const existingLock = this.getLock(udid, displayId);
        if (existingLock) {
            return false;
        }

        const lockInfo: LockInfo = {
            type: 'user',
            lockHolderId: clientId,
            lockHolderName: displayName,
            acquiredAt: Date.now(),
        };

        this.setLock(udid, displayId, lockInfo);
        return true;
    }

    /**
     * Acquire a workflow lock. Has priority over user locks - will replace existing user lock.
     * Cannot replace existing workflow locks.
     */
    public acquireWorkflowLock(
        udid: string,
        displayId: number,
        workflowId: string,
        workflowName: string,
        clientId: string,
    ): boolean {
        const existingLock = this.getLock(udid, displayId);

        // Cannot acquire if another workflow holds the lock
        if (existingLock && existingLock.type === 'workflow') {
            return false;
        }

        const lockInfo: LockInfo = {
            type: 'workflow',
            lockHolderId: workflowId,
            lockHolderName: workflowName,
            ownerClientId: clientId,
            acquiredAt: Date.now(),
        };

        this.setLock(udid, displayId, lockInfo);
        return true;
    }

    /**
     * Release a lock. Only the lock holder can release.
     */
    public releaseLock(udid: string, displayId: number, holderId: string): boolean {
        const existingLock = this.getLock(udid, displayId);
        if (!existingLock || existingLock.lockHolderId !== holderId) {
            return false;
        }

        this.clearLock(udid, displayId);
        return true;
    }

    /**
     * Force unlock a user lock and transfer to a new holder.
     * Only works on user locks, not workflow locks.
     */
    public forceUnlock(udid: string, displayId: number, newClientId: string, newDisplayName: string): boolean {
        const existingLock = this.getLock(udid, displayId);

        // Can only force-unlock user locks
        if (!existingLock || existingLock.type === 'workflow') {
            return false;
        }

        const lockInfo: LockInfo = {
            type: 'user',
            lockHolderId: newClientId,
            lockHolderName: newDisplayName,
            acquiredAt: Date.now(),
        };

        this.setLock(udid, displayId, lockInfo);
        return true;
    }

    /**
     * Emergency unlock - clears any lock (including workflow locks).
     * Use for stuck workflows or emergency situations.
     */
    public emergencyUnlock(udid: string, displayId: number): boolean {
        const existingLock = this.getLock(udid, displayId);
        if (!existingLock) {
            return false;
        }

        this.clearLock(udid, displayId);
        return true;
    }

    /**
     * Get the current lock for a device/display.
     */
    public getLock(udid: string, displayId: number): LockInfo | null {
        const deviceMap = this.locks.get(udid);
        if (!deviceMap) {
            return null;
        }
        return deviceMap.get(displayId) || null;
    }

    /**
     * Check if a specific client holds the lock.
     * For user locks, checks lockHolderId. For workflow locks, checks ownerClientId.
     */
    public isLockHolder(udid: string, displayId: number, clientId: string): boolean {
        const lock = this.getLock(udid, displayId);
        if (!lock) {
            return false;
        }
        if (lock.type === 'workflow') {
            return lock.ownerClientId === clientId;
        }
        return lock.lockHolderId === clientId;
    }

    private setLock(udid: string, displayId: number, lockInfo: LockInfo): void {
        if (!this.locks.has(udid)) {
            this.locks.set(udid, new Map());
        }
        this.locks.get(udid)!.set(displayId, lockInfo);
        this.emit('lockChanged', { udid, displayId, lock: lockInfo } as LockChangedEvent);
    }

    private clearLock(udid: string, displayId: number): void {
        const deviceMap = this.locks.get(udid);
        if (deviceMap) {
            deviceMap.delete(displayId);
            if (deviceMap.size === 0) {
                this.locks.delete(udid);
            }
        }
        this.emit('lockChanged', { udid, displayId, lock: null } as LockChangedEvent);
    }

    public getName(): string {
        return 'ScreenLockService';
    }

    public start(): Promise<void> {
        return Promise.resolve();
    }

    public release(): void {
        this.locks.clear();
        this.removeAllListeners();
    }
}
