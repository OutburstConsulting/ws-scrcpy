import { ToolBox } from '../../toolbox/ToolBox';
import KeyEvent from '../android/KeyEvent';
import SvgImage from '../../ui/SvgImage';
import { KeyCodeControlMessage } from '../../controlMessage/KeyCodeControlMessage';
import { ToolBoxButton } from '../../toolbox/ToolBoxButton';
import { ToolBoxElement } from '../../toolbox/ToolBoxElement';
import { ToolBoxCheckbox } from '../../toolbox/ToolBoxCheckbox';
import { StreamClientScrcpy } from '../client/StreamClientScrcpy';
import { BasePlayer } from '../../player/BasePlayer';
import { ToolBoxSessionCounter } from '../../toolbox/ToolBoxSessionCounter';

const BUTTONS = [
    {
        title: 'Power button',
        code: KeyEvent.KEYCODE_POWER,
        icon: SvgImage.Icon.POWER,
    },
    {
        title: 'Volume up',
        code: KeyEvent.KEYCODE_VOLUME_UP,
        icon: SvgImage.Icon.VOLUME_UP,
    },
    {
        title: 'Volume down',
        code: KeyEvent.KEYCODE_VOLUME_DOWN,
        icon: SvgImage.Icon.VOLUME_DOWN,
    },
    {
        title: 'Back button',
        code: KeyEvent.KEYCODE_BACK,
        icon: SvgImage.Icon.BACK,
    },
    {
        title: 'Home button',
        code: KeyEvent.KEYCODE_HOME,
        icon: SvgImage.Icon.HOME,
    },
    {
        title: 'Recent apps',
        code: KeyEvent.KEYCODE_APP_SWITCH,
        icon: SvgImage.Icon.OVERVIEW,
    },
];

export interface ToolBoxPanelCallbacks {
    onMoreBoxToggle?: (visible: boolean, triggerButton: HTMLElement) => void;
    onWorkflowBoxToggle?: (visible: boolean, triggerButton: HTMLElement) => void;
}

export class GoogToolBox extends ToolBox {
    private sessionCounter?: ToolBoxSessionCounter;

    protected constructor(list: ToolBoxElement<any>[], sessionCounter?: ToolBoxSessionCounter) {
        super(list);
        this.sessionCounter = sessionCounter;
    }

    public updateSessionCount(count: number, viewers?: string[]): void {
        if (this.sessionCounter) {
            this.sessionCounter.updateCount(count, viewers);
        }
    }

    public static createToolBox(
        udid: string,
        player: BasePlayer,
        client: StreamClientScrcpy,
        moreBox?: HTMLElement,
        workflowBox?: HTMLElement,
        callbacks?: ToolBoxPanelCallbacks,
    ): GoogToolBox {
        const playerName = player.getName();
        const list = BUTTONS.slice();
        const handler = <K extends keyof HTMLElementEventMap, T extends HTMLElement>(
            type: K,
            element: ToolBoxElement<T>,
        ) => {
            if (!element.optional?.code) {
                return;
            }
            const { code } = element.optional;
            const action = type === 'mousedown' ? KeyEvent.ACTION_DOWN : KeyEvent.ACTION_UP;
            const event = new KeyCodeControlMessage(action, code, 0, 0);
            client.sendMessage(event);
        };
        const elements: ToolBoxElement<any>[] = list.map((item) => {
            const button = new ToolBoxButton(item.title, item.icon, {
                code: item.code,
            });
            button.addEventListener('mousedown', handler);
            button.addEventListener('mouseup', handler);
            return button;
        });
        if (player.supportsScreenshot) {
            const screenshot = new ToolBoxButton('Take screenshot', SvgImage.Icon.CAMERA);
            screenshot.addEventListener('click', () => {
                player.createScreenshot(client.getDeviceName());
            });
            elements.push(screenshot);
        }

        const keyboard = new ToolBoxCheckbox(
            'Capture keyboard',
            SvgImage.Icon.KEYBOARD,
            `capture_keyboard_${udid}_${playerName}`,
        );
        keyboard.addEventListener('click', (_, el) => {
            const element = el.getElement();
            client.setHandleKeyboardEvents(element.checked);
        });
        elements.push(keyboard);

        if (moreBox) {
            const displayId = player.getVideoSettings().displayId;
            const id = `show_more_${udid}_${playerName}_${displayId}`;
            const more = new ToolBoxCheckbox('More options', SvgImage.Icon.SETTINGS, id);
            more.addEventListener('click', (_, el) => {
                const element = el.getElement();
                const visible = element.checked;
                moreBox.style.display = visible ? 'block' : 'none';
                if (callbacks?.onMoreBoxToggle) {
                    const triggerButton = more.getElement().parentElement || more.getElement();
                    callbacks.onMoreBoxToggle(visible, triggerButton);
                }
            });
            elements.unshift(more);
        }

        if (workflowBox) {
            const displayId = player.getVideoSettings().displayId;
            const workflowId = `show_workflow_${udid}_${playerName}_${displayId}`;
            const workflowToggle = new ToolBoxCheckbox('Run workflows', SvgImage.Icon.PLAY, workflowId);
            workflowToggle.addEventListener('click', (_, el) => {
                const element = el.getElement();
                const visible = element.checked;
                workflowBox.style.display = visible ? 'block' : 'none';
                if (callbacks?.onWorkflowBoxToggle) {
                    const triggerButton = workflowToggle.getElement().parentElement || workflowToggle.getElement();
                    callbacks.onWorkflowBoxToggle(visible, triggerButton);
                }
            });
            elements.unshift(workflowToggle);
        }

        // Add session counter at the top
        const sessionCounter = new ToolBoxSessionCounter();
        elements.unshift(sessionCounter);

        return new GoogToolBox(elements, sessionCounter);
    }
}
