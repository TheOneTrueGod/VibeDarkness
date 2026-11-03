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

        const bridge: PlaytestBridge = {
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
