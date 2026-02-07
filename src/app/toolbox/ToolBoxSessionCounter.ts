import { ToolBoxElement } from './ToolBoxElement';

export class ToolBoxSessionCounter extends ToolBoxElement<HTMLDivElement> {
    private readonly element: HTMLDivElement;
    private readonly countElement: HTMLSpanElement;
    private readonly iconElement: SVGSVGElement;
    private currentCount = 0;
    private currentViewers: string[] = [];

    constructor() {
        super('Session Count');
        this.element = document.createElement('div');
        this.element.className = 'session-counter';
        this.element.title = 'Connected viewers';

        // Create eye icon using SVG
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('width', '16');
        icon.setAttribute('height', '16');
        icon.classList.add('session-counter-icon');
        this.iconElement = icon;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute(
            'd',
            'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
        );
        icon.appendChild(path);
        this.element.appendChild(icon);

        this.countElement = document.createElement('span');
        this.countElement.className = 'session-counter-count';
        this.countElement.textContent = '0';
        this.element.appendChild(this.countElement);
    }

    public getElement(): HTMLDivElement {
        return this.element;
    }

    public getAllElements(): HTMLElement[] {
        return [this.element];
    }

    public updateCount(count: number, viewers?: string[]): void {
        const previousCount = this.currentCount;
        this.currentCount = count;
        if (Array.isArray(viewers)) {
            this.currentViewers = viewers;
        }
        this.countElement.textContent = count.toString();
        this.updateTitle();

        // Update highlight state based on count
        if (count > 1) {
            this.element.classList.add('session-counter-highlighted');
        } else {
            this.element.classList.remove('session-counter-highlighted');
        }

        // Trigger wobble animation when count changes and there are multiple viewers
        if (count > 1 && count !== previousCount) {
            this.triggerWobble();
        }
    }

    private triggerWobble(): void {
        // Remove the class first to reset animation
        this.iconElement.classList.remove('session-counter-wobble');
        // Force reflow to restart animation
        void this.iconElement.getBoundingClientRect();
        // Add the class to trigger animation
        this.iconElement.classList.add('session-counter-wobble');
    }

    private updateTitle(): void {
        if (!this.currentViewers.length) {
            this.element.title = 'Connected viewers';
            return;
        }
        this.element.title = `Connected viewers: ${this.currentViewers.join(', ')}`;
    }
}
