/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates BattleSession (engine / camera / renderer), PixiJS canvas, card hand,
 * round tracking, targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PlayerState, GameSidebarInfo } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { GameEngine } from '../../game/GameEngine';
import type { SerializedGameState } from '../../game/types';
import type { OrderWaiter, WaitingForOrders, BattleOrder, ResolvedTarget } from '../../game/types';
import { BattleSession } from '../../game/BattleSession';
import { resolveClick, validateAndResolveTarget } from '../../abilities/targeting';
import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityTargets } from '../../abilities/Ability';
import { getAbility } from '../../abilities/AbilityRegistry';
import { TERRAIN_PROPERTIES } from '../../terrain/TerrainType';
import BattleCanvas from '../components/BattleCanvas';
import CardHand from '../components/CardHand';
import TurnIndicator from '../components/TurnIndicator';
import BattleTimeline from '../components/BattleTimeline';
import BossFightHud from '../components/boss/BossFightHud';
import type { BossHudSlice } from '../components/boss/BossFightHud';
import { UnitTag } from '../../game/units/unitTag';
import type { MessageEntry } from '../../../../components/Chat';
import { useGameSyncOptional } from '../../../../contexts/GameSyncContext';
import type { BattleCallbacks } from '../../../../contexts/GameSyncContext';
import { computeSynchash } from '../../../../utils/synchash';

declare global {
    interface Window {
        __minionBattlesDebugMouse?: {
            worldX: number;
            worldY: number;
            row: number;
            col: number;
            terrainName: string;
        };
        /**
         * Debug focus/outline: used by DebugConsole when the user hovers a unit in the UI.
         * When unitId is null, the highlight is cleared.
         */
        __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void;
        /**
         * When > Date.now(), BattleCanvas pauses auto-follow centering to give debug camera focus time.
         */
        __minionBattlesDebugAutoFollowPausedUntil?: number;
        /** Live game tick from engine; DebugConsole polls this for up-to-date display. */
        __minionBattlesDebugGameTick?: number;
        /** Live serialized engine state; DebugConsole Units tab polls this for up-to-date unit data. */
        __minionBattlesDebugGameState?: Record<string, unknown> | null;
        /** Client synchash of live engine state (Game State debug tab). */
        __minionBattlesDebugSynchash?: string;
    }
}

interface BattlePhaseProps {
    api: MinionBattlesApi;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    missionId: string;
    /** Initial game state from server (if reconnecting). */
    initialGameState?: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    /** Called when victory is achieved. Passes mission result from the winning victory check. */
    onVictory?: (missionResult: string) => void;
    /** Called when defeat is achieved (all player units dead). */
    onDefeat?: () => void;
    /** Called when host sends an emitted message (NPC or chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

export default function BattlePhase({
    api,
    playerId,
    isHost,
    players,
    characterSelections,
    missionId,
    initialGameState,
    onSidebarInfoChange,
    onVictory,
    onDefeat,
    onEmittedChatMessage,
}: BattlePhaseProps) {
    const gameSync = useGameSyncOptional();
    const canSubmitOrders = gameSync?.canSubmitOrders ?? true;

    const sessionRef = useRef<BattleSession | null>(null);

    // UI state
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundProgress, setRoundProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [waitingForOrders, setWaitingForOrders] = useState<WaitingForOrders | null>(null);
    /** Local player's current unit in a parallel batch (next unit still needing an order). */
    const [activeLocalWaiter, setActiveLocalWaiter] = useState<OrderWaiter | null>(null);
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
    const [selectedAbility, setSelectedAbility] = useState<AbilityStatic | null>(null);
    const [currentTargets, setCurrentTargets] = useState<ResolvedTarget[]>([]);
    const [myAbilityIds, setMyAbilityIds] = useState<string[]>([]);
    const mouseWorldRef = useRef({ x: 0, y: 0 });
    const targetingStateRef = useRef<{
        selectedAbility: AbilityStatic | null;
        currentTargets: ResolvedTarget[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: WaitingForOrders | null;
        /** Caster unit for targeting preview (parallel batch active local unit). */
        previewOrderUnitId: string | null;
    }>({
        selectedAbility: null,
        currentTargets: [],
        mouseWorld: { x: 0, y: 0 },
        waitingForOrders: null,
        previewOrderUnitId: null,
    });
    targetingStateRef.current = {
        selectedAbility,
        currentTargets,
        mouseWorld: mouseWorldRef.current,
        waitingForOrders,
        previewOrderUnitId: activeLocalWaiter?.unitId ?? null,
    };
    const pendingMovePathRef = useRef<{ col: number; row: number }[] | null>(null);
    const [, forceRender] = useState(0);
    const [bossHud, setBossHud] = useState<BossHudSlice>(null);
    const [storyPauseActive, setStoryPauseActive] = useState(false);
    const prevSyncStatusRef = useRef<string | null>(null);

    const isMyTurn = activeLocalWaiter != null;
    const canUseOrderUi = isMyTurn && canSubmitOrders && !storyPauseActive;

    // ========================================================================
    // Debug unit focus/outline bridge (DebugConsole -> Pixi world)
    // ========================================================================
    useEffect(() => {
        window.__minionBattlesDebugSetUnitHover = (unitId: string | null) => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(unitId);

            if (!unitId) {
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now();
                return;
            }

            const engine = sessionRef.current?.getEngine();
            const camera = sessionRef.current?.getCamera();
            if (!engine || !camera) return;
            const unit = engine.getUnit(unitId);
            if (!unit) return;

            camera.snapTo(unit.x, unit.y, unit.radius);
            window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 2500;
        };

        return () => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(null);
            window.__minionBattlesDebugSetUnitHover = undefined;
            window.__minionBattlesDebugAutoFollowPausedUntil = undefined;
            window.__minionBattlesDebugGameTick = undefined;
            window.__minionBattlesDebugGameState = undefined;
        };
         
    }, []);

    useEffect(() => {
        let hashSeq = 0;
        const id = window.setInterval(() => {
            const engine = sessionRef.current?.getEngine();
            if (engine) {
                if (typeof engine.gameTick === 'number') {
                    window.__minionBattlesDebugGameTick = engine.gameTick;
                }
                const state = engine.toJSON() as unknown as Record<string, unknown>;
                window.__minionBattlesDebugGameState = state;
                const seq = ++hashSeq;
                void computeSynchash(state).then((h) => {
                    if (seq === hashSeq) {
                        window.__minionBattlesDebugSynchash = h;
                    }
                });
            }
        }, 100);
        return () => {
            window.clearInterval(id);
            window.__minionBattlesDebugGameTick = undefined;
            window.__minionBattlesDebugGameState = undefined;
            window.__minionBattlesDebugSynchash = undefined;
        };
    }, []);

    const onSidebarInfoChangeRef = useRef(onSidebarInfoChange);
    onSidebarInfoChangeRef.current = onSidebarInfoChange;
    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => {
        const update = () => {
            const engine = sessionRef.current?.getEngine();
            if (!engine || !onSidebarInfoChangeRef.current) return;

            onSidebarInfoChangeRef.current({
                objectives: engine.getBattleObjectiveRows(),
            });
        };

        update();
        const interval = setInterval(update, 500);
        return () => clearInterval(interval);
    }, [roundNumber]);

    useEffect(() => {
        return () => {
            onSidebarInfoChangeRef.current?.(null);
        };
    }, []);

    const updateCardStateRef = useRef<((engine: GameEngine) => void) | null>(null);

    function updateCardState(engine: GameEngine) {
        const active = engine.getActiveOrderWaiterForPlayer(playerId);
        const unit = active ? engine.getUnit(active.unitId) : engine.getLocalPlayerUnit();
        setMyAbilityIds([...(unit?.abilities ?? [])]);
    }
    updateCardStateRef.current = updateCardState;

    const handleWaitingForOrdersState = useCallback(
        (engine: GameEngine, info: WaitingForOrders, _source: 'engine_callback' | 'post_full_state_sync') => {
            setWaitingForOrders(info);
            setIsPaused(true);
            setStoryPauseActive(engine.storyPauseActive);

            const active = engine.getActiveOrderWaiterForPlayer(playerId);
            setActiveLocalWaiter(active);
            const unit = active ? engine.getUnit(active.unitId) : undefined;
            const existingPath = unit?.pathInvalidated ? undefined : unit?.movement?.path;
            pendingMovePathRef.current = existingPath && existingPath.length > 0
                ? existingPath.map((p) => ({ ...p }))
                : null;

            updateCardStateRef.current?.(engine);
        },
        [playerId],
    );

    useEffect(() => {
        sessionRef.current?.updateLobbyContext(players, characterSelections);
    }, [players, characterSelections]);

    // ========================================================================
    // BattleSession lifecycle (mount load + UI subscription)
    // ========================================================================
    useEffect(() => {
        const session = new BattleSession({
            api,
            missionId,
            playerId,
            isHost,
            onVictory,
            onDefeat,
            onEmittedChatMessage,
        });
        sessionRef.current = session;

        const unsub = session.subscribe((ev) => {
            if (ev.type === 'waiting_for_orders') {
                handleWaitingForOrdersState(ev.engine, ev.info, ev.source);
            }
            if (ev.type === 'pause_state') {
                setWaitingForOrders(ev.waitingForOrders);
                setIsPaused(ev.paused);
                const eng = sessionRef.current?.getEngine();
                setActiveLocalWaiter(eng?.getActiveOrderWaiterForPlayer(playerId) ?? null);
                setStoryPauseActive(eng?.storyPauseActive ?? false);
            }
            if (ev.type === 'round_number') {
                setRoundNumber(ev.roundNumber);
            }
            if (ev.type === 'round_progress') {
                setRoundProgress(ev.progress);
            }
            if (ev.type === 'card_state') {
                updateCardState(ev.engine);
                setActiveLocalWaiter(ev.engine.getActiveOrderWaiterForPlayer(playerId));
                setStoryPauseActive(ev.engine.storyPauseActive);
            }
        });

        session.updateLobbyContext(players, characterSelections);
        session.load(players, characterSelections, initialGameState ?? undefined);

        return () => {
            unsub();
            session.destroy();
            sessionRef.current = null;
        };
        // Intentionally mount once: same pattern as previous loadGameState([]).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        sessionRef.current?.setSyncBridge(
            gameSync
                ? {
                      saveCheckpoint: gameSync.saveCheckpoint,
                      submitOrder: gameSync.submitOrder,
                  }
                : null,
        );
    }, [gameSync]);

    useEffect(() => {
        if (!gameSync) return;

        const callbacks: BattleCallbacks = {
            onFullResync: (gameState: SerializedGameState) => {
                sessionRef.current?.loadFromSnapshot(gameState);
            },
            getEngineSnapshot: () => sessionRef.current?.getSnapshot() ?? null,
            onOrdersReceived: (orders) => {
                sessionRef.current?.applyRemoteOrders(orders);
            },
        };
        gameSync.registerBattleCallbacks(callbacks);
        return () => {
            gameSync.registerBattleCallbacks(null);
        };
    }, [gameSync]);

    useEffect(() => {
        const skipHandler = () => {
            sessionRef.current?.skipTurn();
        };
        gameSync?.registerSkipTurnHandler?.(isHost ? skipHandler : null);
        return () => {
            gameSync?.registerSkipTurnHandler?.(null);
        };
    }, [gameSync, isHost]);

    useEffect(() => {
        const currentSyncStatus = gameSync?.syncStatus ?? null;
        const prevSyncStatus = prevSyncStatusRef.current;
        prevSyncStatusRef.current = currentSyncStatus;

        if (currentSyncStatus !== 'synced') return;
        if (prevSyncStatus !== 'resyncing' && prevSyncStatus !== 'loading') return;

        const engine = sessionRef.current?.getEngine();
        const waiting = engine?.waitingForOrders;
        if (!engine || !waiting) return;
        const needsReplay = waiting.waiters.some((w) => {
            const unit = engine.getUnit(w.unitId);
            return unit != null && engine.shouldPauseForOrders(unit);
        });
        if (!needsReplay) return;

        console.debug('[BattlePhase] Replaying waiting-for-orders after full-state sync', {
            fromSyncStatus: prevSyncStatus,
            toSyncStatus: currentSyncStatus,
            gameTick: engine.gameTick,
            waitingForOrders: waiting,
        });
        sessionRef.current?.replayWaitingForOrdersAfterSync();
    }, [gameSync?.syncStatus, gameSync?.gameState]);

    useEffect(() => {
        const tick = () => {
            const eng = sessionRef.current?.getEngine();
            if (!eng) {
                setBossHud(null);
                return;
            }
            const bosses = eng.units.filter((u) => u.isAlive() && u.tags.includes(UnitTag.Boss));
            const b = bosses[0];
            if (!b) {
                setBossHud(null);
                return;
            }
            const next: BossHudSlice = {
                name: b.name,
                hp: b.hp,
                maxHp: b.maxHp,
                poiseHp: b.poiseHp,
                maxPoiseHp: b.maxPoiseHp,
            };
            setBossHud((prev) =>
                prev &&
                prev.name === next.name &&
                prev.hp === next.hp &&
                prev.maxHp === next.maxHp &&
                prev.poiseHp === next.poiseHp &&
                prev.maxPoiseHp === next.maxPoiseHp
                    ? prev
                    : next,
            );
        };
        tick();
        const id = window.setInterval(tick, 100);
        return () => window.clearInterval(id);
    }, []);

    const handleSelectCard = useCallback((handIndex: number, ability: AbilityStatic) => {
        if (selectedCardIndex === handIndex) {
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
            return;
        }

        setSelectedCardIndex(handIndex);
        setSelectedAbility(ability);
        setCurrentTargets([]);
    }, [selectedCardIndex]);

    const submitOrder = useCallback((abilityId: string, targets: ResolvedTarget[]) => {
        if (!waitingForOrders || !activeLocalWaiter || !canUseOrderUi) return;

        const movePath = pendingMovePathRef.current;

        const order: BattleOrder = {
            unitId: activeLocalWaiter.unitId,
            abilityId,
            targets,
            movePath: movePath ?? undefined,
        };

        targetingStateRef.current.selectedAbility = null;
        targetingStateRef.current.currentTargets = [];
        targetingStateRef.current.waitingForOrders = null;
        pendingMovePathRef.current = null;

        void sessionRef.current?.submitPlayerOrder(order, { canSubmitOrders: canUseOrderUi });
    }, [waitingForOrders, activeLocalWaiter, canUseOrderUi]);

    const handleCanvasClick = useCallback((screenX: number, screenY: number) => {
        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (!engine || !camera || !selectedAbility || !canUseOrderUi || !activeLocalWaiter) return;

        const clickResult = resolveClick(screenX, screenY, camera, engine.units);

        const targetIndex = currentTargets.length;
        const caster = engine.getUnit(activeLocalWaiter.unitId);
        const resolvedTargets = getAbilityTargets(selectedAbility, caster, engine);
        const targetDef = resolvedTargets[targetIndex];
        if (!targetDef) return;

        const resolved = validateAndResolveTarget(targetDef, clickResult);
        if (!resolved) return;

        const newTargets = [...currentTargets, resolved];
        setCurrentTargets(newTargets);

        if (newTargets.length >= resolvedTargets.length) {
            submitOrder(selectedAbility.id, newTargets);
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
        }
    }, [selectedAbility, currentTargets, canUseOrderUi, activeLocalWaiter, submitOrder]);

    const handleCanvasMouseMove = useCallback((screenX: number, screenY: number) => {
        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (camera) {
            const worldPos = camera.screenToWorld(screenX, screenY);
            mouseWorldRef.current = worldPos;

            if (engine?.terrainManager) {
                const grid = engine.terrainManager.grid;
                const worldWidth = engine.getWorldWidth();
                const worldHeight = engine.getWorldHeight();
                const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
                const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));
                const { col, row } = grid.worldToGrid(clampedX, clampedY);
                const terrain = engine.terrainManager.getTerrainAt(clampedX, clampedY);
                const terrainName = TERRAIN_PROPERTIES[terrain]?.name ?? String(terrain);

                window.__minionBattlesDebugMouse = {
                    worldX: clampedX,
                    worldY: clampedY,
                    row,
                    col,
                    terrainName,
                };
            }
        }
        forceRender((n) => n + 1);
    }, []);

    const handleWait = useCallback(() => {
        const engine = sessionRef.current?.getEngine();
        if (!engine || !canUseOrderUi || !activeLocalWaiter || !waitingForOrders) return;

        submitOrder('wait', []);
        setSelectedCardIndex(null);
        setSelectedAbility(null);
        setCurrentTargets([]);
    }, [canUseOrderUi, activeLocalWaiter, waitingForOrders, submitOrder]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                handleWait();
                return;
            }
            const digit = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
            if (digit > 0) {
                const index = digit - 1;
                if (index < myAbilityIds.length) {
                    const abilityId = myAbilityIds[index];
                    const ability = abilityId ? getAbility(abilityId) : null;
                    if (ability) {
                        e.preventDefault();
                        handleSelectCard(index, ability);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleWait, handleSelectCard, myAbilityIds]);

    const handleCanvasRightClick = useCallback((screenX: number, screenY: number) => {
        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (!engine || !camera || !canUseOrderUi || !activeLocalWaiter || !waitingForOrders) return;
        if (!engine.terrainManager) return;

        const grid = engine.terrainManager.grid;
        const worldPos = camera.screenToWorld(screenX, screenY);
        const worldWidth = engine.getWorldWidth();
        const worldHeight = engine.getWorldHeight();
        const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
        const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));

        const unit = engine.getUnit(activeLocalWaiter.unitId);
        if (!unit) return;

        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const destGrid = grid.worldToGrid(clampedX, clampedY);
        const gridPath = engine.terrainManager.findGridPath(
            unitGrid.col, unitGrid.row,
            destGrid.col, destGrid.row,
        );

        if (gridPath) {
            pendingMovePathRef.current = gridPath;
            unit.setMovement(gridPath, undefined, engine.gameTick);
        }
    }, [canUseOrderUi, activeLocalWaiter, waitingForOrders]);

    const engine = sessionRef.current?.getEngine() ?? null;
    const renderer = sessionRef.current?.getRenderer() ?? null;
    const camera = sessionRef.current?.getCamera() ?? null;

    if (!engine || !renderer || !camera) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full h-full flex min-h-0 flex-col relative">
            <BossFightHud boss={bossHud} />
            {/* Timeline rail + canvas stack share space above the hand; hand spans full width */}
            <div className="flex min-h-0 flex-1 flex-row">
                <aside
                    className="flex w-72 shrink-0 min-h-0 flex-col overflow-x-hidden border-r border-dark-700"
                    aria-label="Action timeline"
                >
                    <BattleTimeline
                        engine={engine}
                        players={players}
                        localPlayerId={playerId}
                        layout="rail"
                        previewAbility={canUseOrderUi ? selectedAbility : null}
                        previewOrderUnitId={activeLocalWaiter?.unitId ?? null}
                    />
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        <BattleCanvas
                            engine={engine}
                            camera={camera}
                            renderer={renderer}
                            targetingStateRef={targetingStateRef}
                            onCanvasClick={handleCanvasClick}
                            onCanvasRightClick={handleCanvasRightClick}
                            onCanvasMouseMove={handleCanvasMouseMove}
                        />
                    </div>

                    <TurnIndicator
                        state={
                            !waitingForOrders
                                ? 'playing'
                                : storyPauseActive
                                  ? 'playing'
                                  : canUseOrderUi
                                    ? 'your_turn'
                                    : waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
                                      ? 'ally_turn'
                                      : 'playing'
                        }
                        allyName={
                            waitingForOrders &&
                            waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
                                ? players[
                                      waitingForOrders.waiters.find((w) => w.ownerId !== playerId)!
                                          .ownerId
                                  ]?.name ?? 'Player'
                                : undefined
                        }
                    />
                </div>
            </div>

            <div className="shrink-0 min-w-0">
                <CardHand
                    abilityIds={myAbilityIds}
                    playerUnit={
                        activeLocalWaiter != null
                            ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
                            : engine.getLocalPlayerUnit()
                    }
                    isMyTurn={canUseOrderUi}
                    roundNumber={roundNumber}
                    roundProgress={roundProgress}
                    isPaused={isPaused}
                    selectedCardIndex={selectedCardIndex}
                    onSelectCard={handleSelectCard}
                    onWait={handleWait}
                    gameState={engine}
                />
            </div>
        </div>
    );
}
