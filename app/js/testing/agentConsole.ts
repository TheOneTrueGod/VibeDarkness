/**
 * Dev-only `window.__mbAgent`: DOM helpers that let browser-driving agents work the menus through
 * `data-testid` hooks (see `testIds.ts`) instead of guessing at screenshots.
 *
 * Every action goes through the real DOM: `click` hit-tests the element's centre and dispatches
 * the pointer/mouse/click sequence on whatever is on top there, so React's own handlers run exactly
 * as they do for a human (and a covering overlay is reported instead of clicked through). `fill` uses the native value
 * setter plus an `input` event, which is how React controlled inputs see typing. Nothing here
 * calls app state or APIs directly.
 *
 * Battle-canvas input (world-space clicks) lives on `window.__minionBattlesPlaytest.input`.
 */

export interface AgentTestIdInfo {
    id: string;
    tag: string;
    text: string;
    disabled: boolean;
    disabledReason: string | null;
}

export interface AgentConsole {
    help(): string;
    /** Visible elements with a `data-testid`, optionally filtered by id prefix or substring. */
    ids(filter?: string): AgentTestIdInfo[];
    /** Native click on the first visible element with this test id. Throws if missing or disabled. */
    click(testId: string, opts?: { force?: boolean; index?: number }): string;
    /** Native click on the first visible button whose trimmed text or aria-label equals `label`. */
    clickButton(label: string, opts?: { force?: boolean }): string;
    /** Type into an input/textarea the way React sees typing. */
    fill(testId: string, value: string): string;
    text(testId: string): string | null;
    /** Resolve once a visible element with this test id exists (default 10s). */
    waitFor(testId: string, timeoutMs?: number): Promise<AgentTestIdInfo>;
    /** Visible button labels (for screens without test ids). */
    buttons(): { label: string; disabled: boolean; testId: string | null }[];
    /** Viewport, page visibility and measured requestAnimationFrame rate (the battle engine ticks on rAF). */
    env(sampleMs?: number): Promise<{ viewport: string; visibility: DocumentVisibilityState; rafPerSecond: number; healthy: boolean }>;
}

declare global {
    interface Window {
        __mbAgent?: AgentConsole;
    }
}

function isVisible(el: Element): boolean {
    if (!(el instanceof HTMLElement || el instanceof SVGElement)) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
}

function disabledReasonOf(el: Element): string | null {
    const reason = el.getAttribute('data-disabled-reason');
    if (reason) return reason;
    if ((el as HTMLButtonElement).disabled) return 'disabled';
    if (el.getAttribute('aria-disabled') === 'true') return 'aria-disabled';
    return null;
}

function describe(el: Element): AgentTestIdInfo {
    const reason = disabledReasonOf(el);
    return {
        id: el.getAttribute('data-testid') ?? '',
        tag: el.tagName.toLowerCase(),
        text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        disabled: reason != null,
        disabledReason: reason,
    };
}

function visibleByTestId(testId: string): Element[] {
    return Array.from(document.querySelectorAll(`[data-testid="${CSS.escape(testId)}"]`)).filter(isVisible);
}

function shortDescribe(el: Element): string {
    const testId = el.closest('[data-testid]')?.getAttribute('data-testid');
    const comp = el.closest('[data-className]')?.getAttribute('data-className');
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 50);
    return `<${el.tagName.toLowerCase()}>${testId ? ` testid=${testId}` : ''}${comp ? ` in ${comp}` : ''}${text ? ` "${text}"` : ''}`;
}

/**
 * Click like a mouse: hit-test the element's centre and dispatch the full pointer/mouse sequence
 * on the topmost element there. Test ids often sit on wrapper divs whose handlers live on a child,
 * so `el.click()` on the wrapper would never reach them. If the centre is covered by something
 * outside `el` (an overlay, tutorial, modal), refuse unless `force`, and say what covers it.
 */
function rectText(r: DOMRect): string {
    return `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
}

/** Centre first, then inner points a human might aim at when part of the element is covered. */
const HIT_POINTS: [number, number][] = [
    [0.5, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.25, 0.5],
    [0.75, 0.5],
];

function findHitPoint(el: Element): { target: Element; clientX: number; clientY: number } | { cover: Element | null } {
    let firstCover: Element | null = null;
    for (const [fx, fy] of HIT_POINTS) {
        const rect = el.getBoundingClientRect();
        const clientX = rect.left + rect.width * fx;
        const clientY = rect.top + rect.height * fy;
        const hit = document.elementFromPoint(clientX, clientY);
        if (hit && el.contains(hit)) return { target: hit, clientX, clientY };
        firstCover ??= hit;
    }
    return { cover: firstCover };
}

function mouseClick(el: Element, force: boolean): void {
    if (window.innerWidth === 0 || window.innerHeight === 0) {
        throw new Error(
            `__mbAgent: the viewport is ${window.innerWidth}x${window.innerHeight} (document ${document.visibilityState}). ` +
                'The browser pane is probably hidden; ask the user to show it (a hidden pane also pauses requestAnimationFrame, so the battle engine stops ticking).',
        );
    }
    let hit = findHitPoint(el);
    if ('cover' in hit && hit.cover == null) {
        // Off-screen: scroll it into view the way a human would before clicking.
        (el as HTMLElement).scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        hit = findHitPoint(el);
    }
    let target: Element;
    let clientX: number;
    let clientY: number;
    if ('target' in hit) {
        ({ target, clientX, clientY } = hit);
    } else {
        const rect = el.getBoundingClientRect();
        if (!force) {
            const cover = hit.cover;
            throw new Error(
                `__mbAgent: click target ${rectText(rect)} is ${cover ? `covered by ${shortDescribe(cover)} ${rectText(cover.getBoundingClientRect())}` : 'outside the viewport'}` +
                    ` (viewport ${window.innerWidth}x${window.innerHeight}, document ${document.visibilityState}; pass {force: true} to click through)`,
            );
        }
        target = el.querySelector('button, [role="button"]') ?? el.firstElementChild ?? el;
        clientX = rect.left + rect.width / 2;
        clientY = rect.top + rect.height / 2;
    }
    const init: PointerEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
        button: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
    };
    target.dispatchEvent(new PointerEvent('pointerover', init));
    target.dispatchEvent(new MouseEvent('mouseover', init));
    target.dispatchEvent(new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    target.dispatchEvent(new MouseEvent('mousedown', { ...init, buttons: 1 }));
    target.dispatchEvent(new PointerEvent('pointerup', init));
    target.dispatchEvent(new MouseEvent('mouseup', init));
    target.dispatchEvent(new MouseEvent('click', init));
}

function buttonLabel(el: Element): string {
    return (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const HELP = `window.__mbAgent (dev only). All actions are native DOM events, so React handlers run as for a human.
  ids(filter?)             visible data-testid elements [{id, text, disabled, disabledReason}]
  click(testId, {index?})  native click; throws if missing or disabled (force: true to click anyway)
  clickButton(label)       click a visible button by exact text / aria-label
  buttons()                visible buttons [{label, disabled, testId}]
  fill(testId, value)      type into a React input
  text(testId)             trimmed text content
  waitFor(testId, ms?)     promise, resolves when visible
  env()                    promise: viewport, page visibility, rAF/s (0 means the pane is hidden and the engine is paused)
Battle canvas input: window.__minionBattlesPlaytest.input.help()`;

export function installAgentConsole(): void {
    if (!import.meta.env.DEV || typeof window === 'undefined') return;

    const agent: AgentConsole = {
        help: () => HELP,
        ids: (filter) =>
            Array.from(document.querySelectorAll('[data-testid]'))
                .filter(isVisible)
                .map(describe)
                .filter((info) => !filter || info.id.startsWith(filter) || info.id.includes(filter)),
        click: (testId, opts = {}) => {
            const matches = visibleByTestId(testId);
            const el = matches[opts.index ?? 0];
            if (!el) throw new Error(`__mbAgent.click: no visible [data-testid="${testId}"] (found ${matches.length})`);
            const reason = disabledReasonOf(el);
            if (reason && !opts.force) throw new Error(`__mbAgent.click: "${testId}" is disabled (${reason})`);
            mouseClick(el, !!opts.force);
            return `clicked ${testId}`;
        },
        clickButton: (label, opts = {}) => {
            const el = Array.from(document.querySelectorAll('button, [role="button"]'))
                .filter(isVisible)
                .find((b) => buttonLabel(b) === label);
            if (!el) throw new Error(`__mbAgent.clickButton: no visible button labelled "${label}"`);
            const reason = disabledReasonOf(el);
            if (reason && !opts.force) throw new Error(`__mbAgent.clickButton: "${label}" is disabled (${reason})`);
            mouseClick(el, !!opts.force);
            return `clicked button "${label}"`;
        },
        buttons: () =>
            Array.from(document.querySelectorAll('button, [role="button"]'))
                .filter(isVisible)
                .map((b) => ({ label: buttonLabel(b).slice(0, 60), disabled: disabledReasonOf(b) != null, testId: b.getAttribute('data-testid') })),
        fill: (testId, value) => {
            const el = visibleByTestId(testId)[0];
            if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
                throw new Error(`__mbAgent.fill: "${testId}" is not a visible input/textarea`);
            }
            const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return `filled ${testId}`;
        },
        text: (testId) => {
            const el = visibleByTestId(testId)[0];
            return el ? (el.textContent ?? '').replace(/\s+/g, ' ').trim() : null;
        },
        env: (sampleMs = 1000) =>
            new Promise((resolve) => {
                let frames = 0;
                let running = true;
                const step = () => {
                    if (!running) return;
                    frames++;
                    requestAnimationFrame(step);
                };
                requestAnimationFrame(step);
                window.setTimeout(() => {
                    running = false;
                    const rafPerSecond = Math.round((frames * 1000) / sampleMs);
                    resolve({
                        viewport: `${window.innerWidth}x${window.innerHeight}`,
                        visibility: document.visibilityState,
                        rafPerSecond,
                        healthy: window.innerHeight > 0 && document.visibilityState === 'visible' && rafPerSecond >= 20,
                    });
                }, sampleMs);
            }),
        waitFor: (testId, timeoutMs = 10_000) =>
            new Promise((resolve, reject) => {
                const started = Date.now();
                const poll = () => {
                    const el = visibleByTestId(testId)[0];
                    if (el) return resolve(describe(el));
                    if (Date.now() - started > timeoutMs) return reject(new Error(`__mbAgent.waitFor: "${testId}" not visible after ${timeoutMs}ms`));
                    window.setTimeout(poll, 100);
                };
                poll();
            }),
    };
    window.__mbAgent = agent;
}
