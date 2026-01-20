export class DraggablePanel {
    private isDragging = false;
    private dragOffsetX = 0;
    private dragOffsetY = 0;
    private panel: HTMLElement;
    private dragHandle: HTMLElement;

    constructor(panel: HTMLElement, dragHandle: HTMLElement) {
        this.panel = panel;
        this.dragHandle = dragHandle;
        this.setupDragging();
    }

    private setupDragging(): void {
        this.dragHandle.style.cursor = 'move';
        this.dragHandle.addEventListener('mousedown', this.onMouseDown);
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }

    private onMouseDown = (e: MouseEvent): void => {
        // Only drag on left click
        if (e.button !== 0) return;

        this.isDragging = true;
        const rect = this.panel.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;

        // Prevent text selection while dragging
        e.preventDefault();
    };

    private onMouseMove = (e: MouseEvent): void => {
        if (!this.isDragging) return;

        const parent = this.panel.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();

        // Calculate new position relative to parent
        let newX = e.clientX - parentRect.left - this.dragOffsetX;
        let newY = e.clientY - parentRect.top - this.dragOffsetY;

        // Constrain to parent bounds
        const panelRect = this.panel.getBoundingClientRect();
        const maxX = parentRect.width - panelRect.width;
        const maxY = parentRect.height - panelRect.height;

        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        // Apply position
        this.panel.style.left = `${newX}px`;
        this.panel.style.top = `${newY}px`;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
    };

    private onMouseUp = (): void => {
        this.isDragging = false;
    };

    public positionNear(element: HTMLElement, preferredSide: 'left' | 'right' = 'left'): void {
        const parent = this.panel.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const triggerRect = element.getBoundingClientRect();
        const panelRect = this.panel.getBoundingClientRect();

        // Calculate position relative to parent
        let x: number;
        let y = triggerRect.top - parentRect.top;

        if (preferredSide === 'left') {
            // Position to the left of the trigger
            x = triggerRect.left - parentRect.left - panelRect.width - 10;
            // If not enough space on left, try right
            if (x < 0) {
                x = triggerRect.right - parentRect.left + 10;
            }
        } else {
            // Position to the right of the trigger
            x = triggerRect.right - parentRect.left + 10;
            // If not enough space on right, try left
            if (x + panelRect.width > parentRect.width) {
                x = triggerRect.left - parentRect.left - panelRect.width - 10;
            }
        }

        // Constrain to parent bounds
        x = Math.max(10, Math.min(x, parentRect.width - panelRect.width - 10));
        y = Math.max(10, Math.min(y, parentRect.height - panelRect.height - 10));

        this.panel.style.left = `${x}px`;
        this.panel.style.top = `${y}px`;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
    }

    public destroy(): void {
        this.dragHandle.removeEventListener('mousedown', this.onMouseDown);
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }
}
