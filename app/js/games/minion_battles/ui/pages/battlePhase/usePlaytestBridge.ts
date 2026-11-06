import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { BattleSession } from '../../../game/BattleSession';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { MISSION_MAP } from '../../../storylines';

/**
 * Dev-only `window.__minionBattlesPlaytest`: read-only battle state plus world ↔ screen helpers
 * for the jp-playtest Playwright driver (`scripts/playtest-multiplayer.mjs`).
 *
 * It never submits orders. The driver clicks the real canvas, ability cards and Pass button at
 * the screen points this bridge reports, so input goes through the normal UI → targeting tools →
 * `BattleSession.submitPlayerOrder` → `BattleNet.submitOrder` path. `focus` only moves the camera.
 */

interface PlaytestUiState {
    canUseOrderUi: boolean;
    interactiveTargetingState: string;
    awaitingServerAfterSubmit: boolean;
}

/** One stretch of the Your Turn spinner ("Turn submitted, waiting for the server"). */
interface SpinnerSpan {
    startedAt: number;
    endedAt: number | null;
    tickAtStart: number | null;
}

const MAX_SPINNER_SPANS = 500;

export interface PlaytestBridge {
    snapshot(): Record<string, unknown> | null;
    worldToScreen(x: number, y: number): { x: number; y: number; inView: boolean } | null;
    gridToWorld(col: number, row: number): { x: number; y: number } | null;
    /** Centre the camera on a world point and hold auto-follow off for `holdMs`. */
    focus(x: number, y: number, holdMs?: number): void;
    /** Spinner spans in `performance.now()` ms; `endedAt` null while still spinning. */
    spinnerSpans(): SpinnerSpan[];
    /** Real DOM input on the battle canvas at world points (see `PlaytestCanvasInput`). */
    input: PlaytestCanvasInput;
}

/**
 * Canvas input for agents. Each call dispatches the same native pointer/mouse events a human's
 * mouse produces on the `<canvas>` (pointermove → pointerdown → pointerup → click, or
 * contextmenu for right-click), at the screen point the camera maps the world point to. So
 * orders still flow through BattleCanvas → targeting tools / ITS → `submitPlayerOrder` →
 * `BattleNet.submitOrder`. Off-screen points are brought into view with `focus` first.
 */
export interface PlaytestCanvasInput {
    help(): string;
    hoverWorld(x: number, y: number): string;
    clickWorld(x: number, y: number, opts?: { shift?: boolean }): string;
    rightClickWorld(x: number, y: number, opts?: { shift?: boolean; ctrl?: boolean }): string;
    clickUnit(unitId: string): string;
    rightClickUnit(unitId: string): string;
    /** What a mouse at this world point would hit: topmost element, whether it is the battle canvas, and the screen point. */
    /**
     * Macro of real clicks: click the ability card, then click the unit for each target prompt
     * (ITS "Target location" etc.) until the order is submitted or `maxClicks` is reached.
     */
    castAt(abilityId: string, unitId: string, opts?: { maxClicks?: number; stepMs?: number; promptTimeoutMs?: number }): Promise<string[]>;
    debugHit(x: number, y: number): { clientX: number; clientY: number; isBattleCanvas: boolean; topmost: string; viewport: string };
}

const INPUT_HELP = `window.__minionBattlesPlaytest.input: native canvas events at world points (same path as a mouse).
  hoverWorld(x, y)                  pointermove only (updates aim preview)
  clickWorld(x, y, {shift?})        left click (targeting / ITS picks)
  rightClickWorld(x, y, {shift?, ctrl?})   right click (move order)
  clickUnit(id) / rightClickUnit(id)       same, at that unit's position
  castAt(abilityId, unitId)         async: card click, then clickUnit per target prompt; returns a step log
  debugHit(x, y)                    topmost element at that point (is it the canvas, or an overlay?)
Snapshot 'its' block: while its.active the engine is a PREVIEW running ahead of the real timeline;
on commit it restores to its.markTick (see its.lastRestore), so the tick going back is expected.Pair with __mbAgent.click('battle-ability-card-<id>'), __mbAgent.click('battle-pass'), __mbAgent.clickButton('Done').`;

function findBattleCanvas(): HTMLCanvasElement | null {
    // The battle view's main canvas is the one wired with React pointer handlers; HUD/effect
    // canvases are pointer-events: none overlays.
    const canvases = Array.from(document.querySelectorAll('canvas')) as HTMLCanvasElement[];
    return (
        canvases.find((c) => c.classList.contains('touch-none') && window.getComputedStyle(c).pointerEvents !== 'none') ??
        canvases[0] ??
        null
    );
}

declare global {
    interface Window {
        __minionBattlesPlaytest?: PlaytestBridge;
    }
}

interface UsePlaytestBridgeParams extends PlaytestUiState {
    sessionRef: RefObject<BattleSession | null>;
    missionId: string;
    playerId: string;
    isHost: boolean;
}

export function usePlaytestBridge({
    sessionRef,
    missionId,
    playerId,
    isHost,
    canUseOrderUi,
    interactiveTargetingState,
    awaitingServerAfterSubmit,
}: UsePlaytestBridgeParams) {
    const uiRef = useRef<PlaytestUiState>({ canUseOrderUi, interactiveTargetingState, awaitingServerAfterSubmit });
    uiRef.current = { canUseOrderUi, interactiveTargetingState, awaitingServerAfterSubmit };
    const spansRef = useRef<SpinnerSpan[]>([]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        const spans = spansRef.current;
        const last = spans[spans.length - 1];
        if (awaitingServerAfterSubmit && (!last || last.endedAt != null)) {
            spans.push({
                startedAt: performance.now(),
                endedAt: null,
                tickAtStart: sessionRef.current?.getEngine()?.gameTick ?? null,
            });
            if (spans.length > MAX_SPINNER_SPANS) spans.shift();
        } else if (!awaitingServerAfterSubmit && last && last.endedAt == null) {
            last.endedAt = performance.now();
        }
    }, [awaitingServerAfterSubmit, sessionRef]);

    useEffect(() => {
        if (!import.meta.env.DEV) return;

        const toClient = (x: number, y: number): { canvas: HTMLCanvasElement; clientX: number; clientY: number } => {
            const camera = sessionRef.current?.getCamera();
            const canvas = findBattleCanvas();
            if (!camera || !canvas) throw new Error('playtest input: no battle camera/canvas');
            let s = camera.worldToScreen(x, y);
            const inView = (p: { x: number; y: number }) =>
                p.x >= 8 && p.y >= 8 && p.x <= camera.viewportWidth - 8 && p.y <= camera.viewportHeight - 8;
            if (!inView(s)) {
                camera.snapTo(x, y);
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 3000;
                s = camera.worldToScreen(x, y);
            }
            const rect = canvas.getBoundingClientRect();
            return { canvas, clientX: rect.left + s.x, clientY: rect.top + s.y };
        };
        const pointer = (
            canvas: HTMLCanvasElement,
            type: string,
            clientX: number,
            clientY: number,
            button: number,
            mods: { shift?: boolean; ctrl?: boolean },
        ) => {
            const init: PointerEventInit = {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX,
                clientY,
                button,
                buttons: type === 'pointerdown' ? (button === 2 ? 2 : 1) : 0,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true,
                shiftKey: !!mods.shift,
                ctrlKey: !!mods.ctrl,
            };
            canvas.dispatchEvent(
                type.startsWith('pointer') ? new PointerEvent(type, init) : new MouseEvent(type, init),
            );
        };
        const unitPos = (unitId: string) => {
            const u = sessionRef.current?.getEngine()?.units.find((unit) => unit.id === unitId);
            if (!u) throw new Error(`playtest input: no unit ${unitId}`);
            return u;
        };
        const input: PlaytestCanvasInput = {
            help: () => INPUT_HELP,
            hoverWorld: (x, y) => {
                const { canvas, clientX, clientY } = toClient(x, y);
                pointer(canvas, 'pointermove', clientX, clientY, 0, {});
                return `hover (${Math.round(x)}, ${Math.round(y)})`;
            },
            clickWorld: (x, y, mods = {}) => {
                const { canvas, clientX, clientY } = toClient(x, y);
                pointer(canvas, 'pointermove', clientX, clientY, 0, mods);
                pointer(canvas, 'pointerdown', clientX, clientY, 0, mods);
                pointer(canvas, 'pointerup', clientX, clientY, 0, mods);
                pointer(canvas, 'click', clientX, clientY, 0, mods);
                return `click (${Math.round(x)}, ${Math.round(y)})`;
            },
            rightClickWorld: (x, y, mods = {}) => {
                const { canvas, clientX, clientY } = toClient(x, y);
                pointer(canvas, 'pointermove', clientX, clientY, 0, mods);
                pointer(canvas, 'pointerdown', clientX, clientY, 2, mods);
                pointer(canvas, 'pointerup', clientX, clientY, 2, mods);
                pointer(canvas, 'contextmenu', clientX, clientY, 2, mods);
                return `right-click (${Math.round(x)}, ${Math.round(y)})`;
            },
            castAt: async (abilityId, unitId, opts = {}) => {
                const maxClicks = opts.maxClicks ?? 3;
                const stepMs = opts.stepMs ?? 400;
                const wait = () => new Promise((r) => window.setTimeout(r, stepMs));
                const log: string[] = [];
                const agent = window.__mbAgent;
                if (!agent) throw new Error('playtest input.castAt: window.__mbAgent is not installed');
                log.push(agent.click(`battle-ability-card-${abilityId}`));
                // Some abilities take a few seconds to raise their first target prompt (ITS start).
                const promptDeadline = Date.now() + (opts.promptTimeoutMs ?? 6000);
                const prompting = () =>
                    sessionRef.current?.getEngine()?.waitingForTargetInput != null ||
                    uiRef.current.interactiveTargetingState !== 'inactive';
                while (!prompting() && Date.now() < promptDeadline) await wait();
                log.push(prompting() ? 'target prompt up' : 'no target prompt after card click; clicking the unit anyway');
                for (let i = 0; i < maxClicks; i++) {
                    const engine = sessionRef.current?.getEngine();
                    const its = sessionRef.current?.interactiveTargeting;
                    const prompting = engine?.waitingForTargetInput != null || uiRef.current.interactiveTargetingState !== 'inactive' || its?.isActive;
                    if (!prompting && i > 0) break;
                    const label = engine?.waitingForTargetInput?.label;
                    log.push(`${input.clickUnit(unitId)}${label ? ` for "${label}"` : ''}`);
                    await wait();
                }
                const after = sessionRef.current?.getEngine();
                log.push(
                    `after: tick ${after?.gameTick}, its ${sessionRef.current?.interactiveTargeting.isActive ? 'active' : 'inactive'}, ` +
                        `targetPrompt ${after?.waitingForTargetInput?.label ?? 'none'}, awaitingServer ${uiRef.current.awaitingServerAfterSubmit}`,
                );
                return log;
            },
            debugHit: (x, y) => {
                const { canvas, clientX, clientY } = toClient(x, y);
                const top = document.elementFromPoint(clientX, clientY);
                const testId = top?.closest('[data-testid]')?.getAttribute('data-testid');
                return {
                    clientX: Math.round(clientX),
                    clientY: Math.round(clientY),
                    isBattleCanvas: top === canvas,
                    topmost: top ? `<${top.tagName.toLowerCase()} class="${top.getAttribute('class') ?? ''}">${testId ? ` in testid=${testId}` : ''}` : 'nothing (point outside the viewport)',
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                };
            },
            clickUnit: (unitId) => {
                const u = unitPos(unitId);
                return input.clickWorld(u.x, u.y);
            },
            rightClickUnit: (unitId) => {
                const u = unitPos(unitId);
                return input.rightClickWorld(u.x, u.y);
            },
        };

        const bridge: PlaytestBridge = {
            input,
            snapshot: () => {
                const engine = sessionRef.current?.getEngine();
                if (!engine) return null;
                const grid = engine.terrainManager?.grid ?? null;
                const waiter = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
                const objectiveMgr = engine.state.objectiveManager;
                const objectiveDefs = MISSION_MAP[missionId]?.battleObjectives ?? [];
                const localUnit = engine.getLocalPlayerUnit();
                return {
                    missionId,
                    playerId,
                    isHost,
                    tick: engine.gameTick,
                    ...uiRef.current,
                    itsActive: sessionRef.current?.interactiveTargeting.isActive ?? false,
                    /** ITS preview/rollback diagnostics; `tick` above is a preview tick while `its.active`. */
                    its: sessionRef.current?.interactiveTargeting.getDiagState() ?? null,
                    waitingForOrders: engine.waitingForOrders
                        ? {
                              atTick: engine.waitingForOrders.atTick,
                              waiterUnitIds: engine.waitingForOrders.waiters.map((w) => w.unitId),
                          }
                        : null,
                    waitingForTargetInput: engine.waitingForTargetInput,
                    myWaiterUnitId: waiter?.unitId ?? null,
                    localUnitId: localUnit?.id ?? null,
                    cellSize: grid?.cellSize ?? null,
                    units: engine.units.map((u) => ({
                        id: u.id,
                        name: u.name,
                        teamId: u.teamId,
                        ownerId: u.ownerId,
                        x: u.x,
                        y: u.y,
                        radius: u.radius,
                        hp: u.hp,
                        maxHp: u.maxHp,
                        alive: u.isAlive(),
                        ...(grid ? grid.worldToGrid(u.x, u.y) : {}),
                    })),
                    myAbilities: (localUnit?.abilities ?? []).map((id) => {
                        const a = getAbility(id);
                        return { id, name: a?.name ?? id, aiSettings: a?.aiSettings ?? null };
                    }),
                    objectives: objectiveDefs.map((d) => ({
                        id: d.id,
                        label: d.label,
                        active: objectiveMgr.isActive(d.id),
                        completed: objectiveMgr.isCompleted(d.id),
                        toComplete: d.toComplete,
                    })),
                };
            },
            worldToScreen: (x, y) => {
                const camera = sessionRef.current?.getCamera();
                if (!camera) return null;
                const s = camera.worldToScreen(x, y);
                const inView = s.x >= 0 && s.y >= 0 && s.x <= camera.viewportWidth && s.y <= camera.viewportHeight;
                return { x: s.x, y: s.y, inView };
            },
            gridToWorld: (col, row) => sessionRef.current?.getEngine()?.terrainManager?.grid.gridToWorld(col, row) ?? null,
            focus: (x, y, holdMs = 3000) => {
                const camera = sessionRef.current?.getCamera();
                if (!camera) return;
                camera.snapTo(x, y);
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + holdMs;
            },
            spinnerSpans: () => spansRef.current.map((s) => ({ ...s })),
        };
        window.__minionBattlesPlaytest = bridge;
        return () => {
            if (window.__minionBattlesPlaytest === bridge) delete window.__minionBattlesPlaytest;
        };
    }, [sessionRef, missionId, playerId, isHost]);
}
