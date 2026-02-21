/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates the GameEngine, PixiJS canvas, card hand, round tracking,
 * targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayerState, GameSidebarInfo } from '../../../types';
import type { LobbyClient } from '../../../LobbyClient';
import { GameEngine, CHECKPOINT_INTERVAL } from '../engine/GameEngine';
import type { CardInstance } from '../engine/GameEngine';
import { GameRenderer } from '../engine/GameRenderer';
import type { OrderAtTick, SerializedGameState } from '../engine/types';
import { Camera } from '../engine/Camera';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../engine/GameEngine';
import type { WaitingForOrders, BattleOrder, ResolvedTarget } from '../engine/types';
import { resolveClick, validateAndResolveTarget } from '../abilities/targeting';
import type { AbilityStatic } from '../abilities/Ability';
import { DARK_AWAKENING } from '../missions/dark_awakening';
import { LAST_HOLDOUT } from '../missions/last_holdout';
import type { IBaseMissionDef } from '../missions/BaseMissionDef';
import { TerrainManager } from '../terrain/TerrainManager';
import BattleCanvas from '../components/BattleCanvas';
import CardHand from '../components/CardHand';
import RoundProgressBar from '../components/RoundProgressBar';
import { throwError } from '../utils/errors';
import { diffSnapshotFields } from '../utils/snapshotDiff';

const MISSION_MAP: Record<string, IBaseMissionDef> = {
    dark_awakening: DARK_AWAKENING,
    last_holdout: LAST_HOLDOUT,
};

interface BattlePhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    missionId: string;
    /** Initial game state from server (if reconnecting). */
    initialGameState?: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
}

export default function BattlePhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    characterSelections,
    missionId,
    initialGameState,
    onSidebarInfoChange,
}: BattlePhaseProps) {
    // Refs for objects that persist across renders
    const engineRef = useRef<GameEngine | null>(null);
    const rendererRef = useRef<GameRenderer | null>(null);
    const cameraRef = useRef<Camera | null>(null);

    // UI state
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundProgress, setRoundProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [waitingForOrders, setWaitingForOrders] = useState<WaitingForOrders | null>(null);
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
    const [selectedAbility, setSelectedAbility] = useState<AbilityStatic | null>(null);
    const [currentTargets, setCurrentTargets] = useState<ResolvedTarget[]>([]);
    const [myCards, setMyCards] = useState<CardInstance[]>([]);
    const [syncError, setSyncError] = useState<string | null>(null);
    const pendingMovePathRef = useRef<{ col: number; row: number }[] | null>(null);
    const [, forceRender] = useState(0);

    // Polling refs
    const orderPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Is it my turn?
    const isMyTurn = waitingForOrders?.ownerId === playerId;

    // Get the player's unit from the engine
    const playerUnit = useMemo(() => {
        return engineRef.current?.getLocalPlayerUnit() ?? null;
    }, [waitingForOrders, roundNumber]); // re-evaluate when state changes

    // ========================================================================
    // Sidebar info (turn indicator + player health)
    // ========================================================================

    const onSidebarInfoChangeRef = useRef(onSidebarInfoChange);
    onSidebarInfoChangeRef.current = onSidebarInfoChange;

    useEffect(() => {
        const update = () => {
            const engine = engineRef.current;
            if (!engine || !onSidebarInfoChangeRef.current) return;

            const playerUnits = engine.units
                .filter((u) => u.isPlayerControlled())
                .map((u) => ({
                    playerId: u.ownerId,
                    playerName: players[u.ownerId]?.name ?? 'Unknown',
                    characterId: u.characterId,
                    hp: u.hp,
                    maxHp: u.maxHp,
                    isAlive: u.isAlive(),
                }));

            onSidebarInfoChangeRef.current({
                turnIndicator: {
                    visible: isMyTurn,
                    text: 'Your turn! Select a card to play.',
                },
                playerUnits,
            });
        };

        update();
        const interval = setInterval(update, 500);
        return () => clearInterval(interval);
    }, [isMyTurn, roundNumber, players]);

    // Clear sidebar info on unmount
    useEffect(() => {
        return () => {
            onSidebarInfoChangeRef.current?.(null);
        };
    }, []);

    // ========================================================================
    // Initialize engine
    // ========================================================================

    useEffect(() => {
        // Ensure lobbyClient knows our playerId for snapshot/order API calls
        lobbyClient.setCurrentPlayerId(playerId);

        // Create renderer and camera
        const renderer = new GameRenderer();
        const camera = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);
        rendererRef.current = renderer;
        cameraRef.current = camera;

        // Get mission config and terrain (needed for both init paths)
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        renderer.setTerrain(terrainGrid);

        const init = initialGameState as Record<string, unknown> | null | undefined;
        const hasSnapshot = init && Array.isArray(init.units) && (init.units as unknown[]).length > 0 && typeof (init.gameTick ?? init.game_tick) === 'number';

        let engine: GameEngine;
        if (hasSnapshot && init) {
            engine = GameEngine.fromJSON(init as unknown as SerializedGameState, playerId, terrainManager);
            setRoundNumber(engine.roundNumber);
            setRoundProgress(engine.roundProgress);
            setWaitingForOrders(engine.waitingForOrders);
            if (engine.waitingForOrders) setIsPaused(true);
        } else {
            engine = new GameEngine();
            engine.prepareForNewGame({ localPlayerId: playerId, terrainManager });
            const selections = Object.keys(characterSelections).length > 0
                ? characterSelections
                : ((init?.characterSelections ?? init?.character_selections) as Record<string, string>) ?? {};
            const playerUnits = Object.entries(selections).map(([pid, charId]) => ({
                playerId: pid,
                characterId: charId,
                name: players[pid]?.name ?? 'Unknown',
            }));
            mission.initializeGameState(engine, {
                playerUnits,
                localPlayerId: playerId,
                eventBus: engine.eventBus,
                terrainManager,
            });
        }

        engineRef.current = engine;

        async function performDesyncCheck(currentEngine: GameEngine) {
            try {
                const snapshot = await lobbyClient.getGameStateSnapshot(lobbyId, gameId);
                if (!snapshot?.state) return;

                const clientState = currentEngine.toJSON() as unknown as Record<string, unknown>;
                const serverState = snapshot.state as Record<string, unknown>;
                const diffPaths = diffSnapshotFields(clientState, serverState);

                if (diffPaths.length > 0) {
                    throwError({
                        severity: 'medium',
                        message: 'Client Snapshot desync',
                        details: { fields: diffPaths },
                    });
                    await reloadEngineFromSnapshot(snapshot);
                }
            } catch (err) {
                // Non-critical: log and continue (e.g. network error)
                console.warn('Desync check failed:', err);
            }
        }

        function reloadEngineFromSnapshot(
            serverSnapshot: { gameTick: number; state: Record<string, unknown>; orders: Array<{ gameTick: number; order: Record<string, unknown> }> },
        ) {
            const oldEngine = engineRef.current;
            if (!oldEngine || !oldEngine.terrainManager) return;

            const mergedState: Record<string, unknown> = {
                ...serverSnapshot.state,
                orders: serverSnapshot.orders,
            };
            const newEngine = GameEngine.fromJSON(
                mergedState as unknown as SerializedGameState,
                playerId,
                oldEngine.terrainManager,
            );
            oldEngine.destroy();
            engineRef.current = newEngine;

            newEngine.setOnWaitingForOrders((info) => {
                setWaitingForOrders(info);
                setIsPaused(true);
                const unit = newEngine.getUnit(info.unitId);
                const existingPath = unit?.movement?.path;
                pendingMovePathRef.current = existingPath && existingPath.length > 0
                    ? existingPath.map((p) => ({ ...p }))
                    : null;
                updateCardState(newEngine);
                if (info.ownerId === playerId) {
                    performDesyncCheck(newEngine);
                } else {
                    const nextTick = newEngine.gameTick + 1;
                    const checkpointGameTick = Math.floor(nextTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
                    startOrderPolling(checkpointGameTick);
                }
            });
            newEngine.setOnCheckpoint((gameTick, state, orders) => {
                if (!isHost) return;
                saveCheckpoint(gameTick, state as unknown as Record<string, unknown>, orders);
            });
            newEngine.setOnRoundEnd((rn) => {
                setRoundNumber(rn + 1);
                updateCardState(newEngine);
                if (rn % 2 === 0) performSyncCheck(newEngine);
            });
            newEngine.setOnStateChanged(() => {
                setRoundProgress(newEngine.roundProgress);
                setRoundNumber(newEngine.roundNumber);
            });

            setRoundNumber(newEngine.roundNumber);
            setRoundProgress(newEngine.roundProgress);
            setWaitingForOrders(newEngine.waitingForOrders);
            updateCardState(newEngine);

            const myUnit = newEngine.getLocalPlayerUnit();
            if (myUnit && cameraRef.current) {
                cameraRef.current.snapTo(myUnit.x, myUnit.y);
            }
            newEngine.start();
        }

        // Set up callbacks
        engine.setOnWaitingForOrders((info) => {
            setWaitingForOrders(info);
            setIsPaused(true);

            // Preserve the unit's existing movement path so it carries over
            // into the next order (unit keeps walking between turns).
            const unit = engine.getUnit(info.unitId);
            const existingPath = unit?.movement?.path;
            pendingMovePathRef.current = existingPath && existingPath.length > 0
                ? existingPath.map((p) => ({ ...p }))
                : null;

            updateCardState(engine);

            // If our turn: run desync check before player acts
            if (info.ownerId === playerId) {
                performDesyncCheck(engine);
            } else {
                // If not our turn: start polling for orders at the checkpoint that contains the next tick
                const nextTick = engine.gameTick + 1;
                const checkpointGameTick = Math.floor(nextTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
                startOrderPolling(checkpointGameTick);
            }
        });

        engine.setOnCheckpoint((gameTick, state, orders) => {
            if (!isHost) return;
            saveCheckpoint(gameTick, state as unknown as Record<string, unknown>, orders);
        });

        engine.setOnRoundEnd((rn) => {
            setRoundNumber(rn + 1);
            updateCardState(engine);

            // Periodic sync check every 2 rounds
            if (rn % 2 === 0) {
                performSyncCheck(engine);
            }
        });

        engine.setOnStateChanged(() => {
            setRoundProgress(engine.roundProgress);
            setRoundNumber(engine.roundNumber);
        });

        // Snap camera to player's unit
        const myUnit = engine.getLocalPlayerUnit();
        if (myUnit) {
            camera.snapTo(myUnit.x, myUnit.y);
        }

        // Update initial card state
        updateCardState(engine);

        // If restored and waiting for another player's orders, start polling
        if (hasSnapshot && engine.waitingForOrders && engine.waitingForOrders.ownerId !== playerId) {
            const nextTick = engine.gameTick + 1;
            const checkpointGameTick = Math.floor(nextTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
            startOrderPolling(checkpointGameTick);
        }

        // Start the engine
        engine.start();

        return () => {
            engine.destroy();
            renderer.destroy();
            stopOrderPolling();
        };
    }, []); // Run once on mount

    // ========================================================================
    // Card state helper
    // ========================================================================

    function updateCardState(engine: GameEngine) {
        const cards = engine.cards[playerId] ?? [];
        setMyCards([...cards]);
    }

    // ========================================================================
    // Card selection and targeting
    // ========================================================================

    const handleSelectCard = useCallback((handIndex: number, ability: AbilityStatic) => {
        setSelectedCardIndex(handIndex);
        setSelectedAbility(ability);
        setCurrentTargets([]);
    }, []);

    const handleCanvasClick = useCallback((screenX: number, screenY: number) => {
        const engine = engineRef.current;
        const camera = cameraRef.current;
        if (!engine || !camera || !selectedAbility || !isMyTurn) return;

        // Resolve the click
        const clickResult = resolveClick(screenX, screenY, camera, engine.units);

        // Get the next required target
        const targetIndex = currentTargets.length;
        const targetDef = selectedAbility.targets[targetIndex];
        if (!targetDef) return;

        // Validate and resolve
        const resolved = validateAndResolveTarget(targetDef, clickResult);
        if (!resolved) return;

        const newTargets = [...currentTargets, resolved];
        setCurrentTargets(newTargets);

        // Check if all targets are now fulfilled
        if (newTargets.length >= selectedAbility.targets.length) {
            // Fire the ability!
            submitOrder(engine, selectedAbility.id, newTargets);
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
        }
    }, [selectedAbility, currentTargets, isMyTurn]);

    const handleCanvasMouseMove = useCallback((_screenX: number, _screenY: number) => {
        // Preview rendering is handled by the render loop checking selectedAbility
        // We just need to trigger a re-render for the preview
        forceRender((n) => n + 1);
    }, []);

    /** Submit a "wait" order: do nothing for 1s, but allow movement. */
    const handleWait = useCallback(() => {
        const engine = engineRef.current;
        if (!engine || !isMyTurn || !waitingForOrders) return;

        submitOrder(engine, 'wait', []);
        setSelectedCardIndex(null);
        setSelectedAbility(null);
        setCurrentTargets([]);
    }, [isMyTurn, waitingForOrders]);

    // ========================================================================
    // Keyboard shortcuts
    // ========================================================================

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                handleWait();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleWait]);

    const handleCanvasRightClick = useCallback((screenX: number, screenY: number) => {
        const engine = engineRef.current;
        const camera = cameraRef.current;
        if (!engine || !camera || !isMyTurn || !waitingForOrders) return;
        if (!engine.terrainManager) return;

        const grid = engine.terrainManager.grid;

        // Convert screen coords to world coords
        const worldPos = camera.screenToWorld(screenX, screenY);

        // Clamp to world bounds
        const clampedX = Math.max(0, Math.min(worldPos.x, WORLD_WIDTH));
        const clampedY = Math.max(0, Math.min(worldPos.y, WORLD_HEIGHT));

        // Compute grid path from unit to click destination
        const unit = engine.getUnit(waitingForOrders.unitId);
        if (!unit) return;

        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const destGrid = grid.worldToGrid(clampedX, clampedY);
        const gridPath = engine.terrainManager.findGridPath(
            unitGrid.col, unitGrid.row,
            destGrid.col, destGrid.row,
        );

        if (gridPath) {
            pendingMovePathRef.current = gridPath;
            // Set movement on the unit immediately for visual feedback
            unit.setMovement(gridPath, undefined, engine.gameTick);
        }
    }, [isMyTurn, waitingForOrders]);

    // ========================================================================
    // Order submission
    // ========================================================================

    function submitOrder(engine: GameEngine, abilityId: string, targets: ResolvedTarget[]) {
        if (!waitingForOrders) return;

        // Read move path from ref to avoid stale closures when
        // right-click (move) and left-click (ability) happen in quick succession
        const movePath = pendingMovePathRef.current;

        const order: BattleOrder = {
            unitId: waitingForOrders.unitId,
            abilityId,
            targets,
            movePath: movePath ?? undefined,
        };

        // Apply locally and resume (order is queued for gameTick + 1)
        engine.applyOrder(order);
        setWaitingForOrders(null);
        setIsPaused(false);
        pendingMovePathRef.current = null;
        updateCardState(engine);

        const atTick = engine.gameTick + 1; // order is scheduled for next tick
        saveOrder(atTick, order);

        lobbyClient.sendMessage(lobbyId, playerId, 'battle_orders_ready', {
            gameTick: atTick,
        }).catch(() => {});
    }

    // ========================================================================
    // Server sync: checkpoints (every CHECKPOINT_INTERVAL ticks) and orders
    // ========================================================================

    async function saveCheckpoint(gameTick: number, state: Record<string, unknown>, orders: OrderAtTick[]) {
        try {
            const existing = await lobbyClient.getGameStateSnapshot(lobbyId, gameId, gameTick);
            const existingOrders = existing?.orders ?? [];
            const newOrdersFormatted = orders.map((o) => ({ gameTick: o.gameTick, order: o.order as unknown as Record<string, unknown> }));
            const mergedOrders = [...existingOrders, ...newOrdersFormatted];
            await lobbyClient.saveGameStateSnapshot(
                lobbyId, gameId, gameTick,
                state,
                mergedOrders,
            );
        } catch (err) {
            console.error('Failed to save checkpoint:', err);
        }
    }

    async function saveOrder(atTick: number, order: BattleOrder) {
        try {
            const checkpointGameTick = Math.floor(atTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
            const orderRecord: Record<string, unknown> = JSON.parse(JSON.stringify(order));
            await lobbyClient.saveGameOrders(
                lobbyId, gameId, checkpointGameTick, atTick,
                orderRecord,
            );
        } catch (err) {
            console.error('Failed to save order:', err);
        }
    }

    async function pollForOrders(checkpointGameTick: number): Promise<void> {
        try {
            const result = await lobbyClient.getGameOrders(lobbyId, gameId, checkpointGameTick);
            if (!result?.orders?.length) return;

            const engine = engineRef.current;
            if (!engine) return;

            // Only apply orders for ticks we haven't processed yet (avoids re-applying stale orders)
            const newOrders = result.orders.filter(
                (o) => o.gameTick > engine.gameTick,
            );
            if (newOrders.length === 0) return;

            for (const { gameTick: atTick, order } of newOrders) {
                engine.queueOrder(atTick, order as unknown as BattleOrder);
            }
            engine.resumeAfterOrders();
            setWaitingForOrders(null);
            setIsPaused(false);
            updateCardState(engine);
            stopOrderPolling();
        } catch {
            // Silently retry
        }
    }

    function startOrderPolling(checkpointGameTick: number) {
        stopOrderPolling();
        // Poll immediately, then every 1 second (avoids 1s delay if order already on server)
        pollForOrders(checkpointGameTick);
        orderPollRef.current = setInterval(
            () => pollForOrders(checkpointGameTick),
            1000,
        );
    }

    function stopOrderPolling() {
        if (orderPollRef.current) {
            clearInterval(orderPollRef.current);
            orderPollRef.current = null;
        }
    }

    async function performSyncCheck(engine: GameEngine) {
        try {
            const checkpoint = await lobbyClient.getGameStateSnapshot(lobbyId, gameId);
            if (!checkpoint?.state) return;

            const local = engine.toJSON();
            const server = checkpoint.state;

            if (
                local.roundNumber !== server.roundNumber ||
                Math.abs(local.gameTime - (server.gameTime as number)) > 0.5
            ) {
                setSyncError(`State out of sync: local round ${local.roundNumber} vs server round ${server.roundNumber}`);
            }
        } catch {
            // Sync check failed, non-critical
        }
    }

    // ========================================================================
    // Render
    // ========================================================================

    const engine = engineRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;

    if (!engine || !renderer || !camera) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full h-full flex flex-col relative">
            {/* Round progress bar */}
            <RoundProgressBar
                roundNumber={roundNumber}
                progress={roundProgress}
                isPaused={isPaused}
            />

            {/* Sync error banner */}
            {syncError && (
                <div className="absolute top-3 left-3 right-16 z-10 bg-red-900/90 text-red-200 text-xs px-3 py-2 rounded-lg">
                    {syncError}
                    <button
                        onClick={() => setSyncError(null)}
                        className="ml-2 text-red-400 hover:text-white"
                    >
                        &times;
                    </button>
                </div>
            )}

            {/* Waiting indicator */}
            {isPaused && !isMyTurn && waitingForOrders && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 bg-dark-900/90 text-yellow-300 text-sm px-4 py-2 rounded-lg border border-yellow-600/30">
                    Waiting for {players[waitingForOrders.ownerId]?.name ?? 'player'}...
                </div>
            )}

            {/* Game canvas */}
            <BattleCanvas
                engine={engine}
                camera={camera}
                renderer={renderer}
                onCanvasClick={handleCanvasClick}
                onCanvasRightClick={handleCanvasRightClick}
                onCanvasMouseMove={handleCanvasMouseMove}
            />

            {/* Card hand */}
            <CardHand
                cards={myCards}
                playerUnit={playerUnit}
                isMyTurn={isMyTurn}
                selectedCardIndex={selectedCardIndex}
                onSelectCard={handleSelectCard}
                onWait={handleWait}
            />
        </div>
    );
}
