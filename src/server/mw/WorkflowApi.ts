import { Router, Request, Response } from 'express';
import { WorkflowDatabase, Workflow } from '../services/WorkflowDatabase';

export class WorkflowApi {
    private router: Router;

    constructor() {
        this.router = Router();
        this.setupRoutes();
    }

    private setupRoutes(): void {
        // GET /api/workflows - Get all workflows
        this.router.get('/', (_req: Request, res: Response) => {
            try {
                const db = WorkflowDatabase.getInstance();
                const workflows = db.getAllWorkflows();
                res.json({ success: true, workflows });
            } catch (error) {
                console.error('[WorkflowApi] Error getting workflows:', error);
                res.status(500).json({ success: false, error: 'Failed to get workflows' });
            }
        });

        // GET /api/workflows/:id - Get a specific workflow
        this.router.get('/:id', (req: Request, res: Response) => {
            try {
                const db = WorkflowDatabase.getInstance();
                const workflow = db.getWorkflowById(req.params.id);
                if (workflow) {
                    res.json({ success: true, workflow });
                } else {
                    res.status(404).json({ success: false, error: 'Workflow not found' });
                }
            } catch (error) {
                console.error('[WorkflowApi] Error getting workflow:', error);
                res.status(500).json({ success: false, error: 'Failed to get workflow' });
            }
        });

        // POST /api/workflows - Create or update a workflow
        this.router.post('/', (req: Request, res: Response) => {
            try {
                const workflow = req.body as Workflow;
                if (!workflow.id || !workflow.name || !workflow.actions) {
                    res.status(400).json({ success: false, error: 'Invalid workflow data' });
                    return;
                }

                const db = WorkflowDatabase.getInstance();
                workflow.updatedAt = Date.now();
                db.saveWorkflow(workflow);
                res.json({ success: true, workflow });
            } catch (error) {
                console.error('[WorkflowApi] Error saving workflow:', error);
                res.status(500).json({ success: false, error: 'Failed to save workflow' });
            }
        });

        // DELETE /api/workflows/:id - Delete a workflow
        this.router.delete('/:id', (req: Request, res: Response) => {
            try {
                const db = WorkflowDatabase.getInstance();
                const deleted = db.deleteWorkflow(req.params.id);
                if (deleted) {
                    res.json({ success: true });
                } else {
                    res.status(404).json({ success: false, error: 'Workflow not found' });
                }
            } catch (error) {
                console.error('[WorkflowApi] Error deleting workflow:', error);
                res.status(500).json({ success: false, error: 'Failed to delete workflow' });
            }
        });
    }

    public getRouter(): Router {
        return this.router;
    }
}
