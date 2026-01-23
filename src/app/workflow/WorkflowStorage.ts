import { Workflow } from './WorkflowTypes';

interface ApiResponse<T> {
    success: boolean;
    workflows?: T[];
    workflow?: T;
    error?: string;
}

export class WorkflowStorage {
    private static readonly API_BASE = '/api/workflows';

    public static async loadAll(deviceId: string): Promise<Workflow[]> {
        try {
            const response = await fetch(`${this.API_BASE}?deviceId=${encodeURIComponent(deviceId)}`);
            const data: ApiResponse<Workflow> = await response.json();
            if (data.success && data.workflows) {
                return data.workflows;
            }
            return [];
        } catch (error) {
            console.error('[WorkflowStorage] Error loading workflows:', error);
            return [];
        }
    }

    public static async getById(id: string, deviceId: string): Promise<Workflow | undefined> {
        try {
            const response = await fetch(`${this.API_BASE}/${id}?deviceId=${encodeURIComponent(deviceId)}`);
            const data: ApiResponse<Workflow> = await response.json();
            if (data.success && data.workflow) {
                return data.workflow;
            }
            return undefined;
        } catch (error) {
            console.error('[WorkflowStorage] Error getting workflow:', error);
            return undefined;
        }
    }

    public static async save(workflow: Workflow): Promise<boolean> {
        try {
            const response = await fetch(this.API_BASE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(workflow),
            });
            const data: ApiResponse<Workflow> = await response.json();
            return data.success;
        } catch (error) {
            console.error('[WorkflowStorage] Error saving workflow:', error);
            return false;
        }
    }

    public static async delete(workflowId: string, deviceId: string): Promise<boolean> {
        try {
            const response = await fetch(
                `${this.API_BASE}/${workflowId}?deviceId=${encodeURIComponent(deviceId)}`,
                {
                method: 'DELETE',
                },
            );
            const data: ApiResponse<Workflow> = await response.json();
            return data.success;
        } catch (error) {
            console.error('[WorkflowStorage] Error deleting workflow:', error);
            return false;
        }
    }

    public static generateId(): string {
        return `wf_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
