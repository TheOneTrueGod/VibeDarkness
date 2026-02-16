/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates the GameEngine, PixiJS canvas, card hand, round tracking,
 * targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayerState, GameSidebarInfo } from '../../../types';
import type { LobbyClient } from '../../../LobbyClient';
import { GameEngine } from '../engine/GameEngine';
import type { CardInstance } from '../engine/GameEngine';
import { GameRenderer } from '../engine/GameRenderer';
import { Camera } from '../engine/Camera';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../engine/GameEngine';
import type { WaitingForOrders, BattleOrder, ResolvedTarget } from '../engine/types';
import { resolveClick, validateAndResolveTarget } from '../abilities/targeting';
import type { AbilityStatic } from '../abilities/Ability';
import { DARK_AWAKENING } from '../missions/dark_awakening';
import { LAST_HOLDOUT } from '../missions/last_holdout';
import type { MissionBattleConfig } from '../missions/types';
import type { UnitSpawnConfig } from '../engine/types';
import { TerrainManager } from '../terrain/TerrainManager';
import BattleCanvas from '../components/BattleCanvas';
import CardHand from '../components/CardHand';
import RoundProgressBar from '../components/RoundProgressBar';

const MISSION_MAP: Record<string, MissionBattleConfig> = {
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

        // Create engine, renderer, camera
        const engine = new GameEngine();
        const renderer = new GameRenderer();
        const camera = new Camera(800, 600, WORLD_WIDTH, WORLD_HEIGHT);

        engineRef.current = engine;
        rendererRef.current = renderer;
        cameraRef.current = camera;

        // Build player unit configs from character selections
        const playerUnits = Object.entries(characterSelections).map(([pid, charId]) => ({
            playerId: pid,
            characterId: charId,
            name: players[pid]?.name ?? 'Unknown',
        }));

        // Get mission config
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const enemySpawns: UnitSpawnConfig[] = mission.enemies.map((e) => ({
            ...e,
            ownerId: 'ai',
        }));

        // Create terrain from mission config
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);

        // Initialize engine with terrain
        engine.initialize({
            playerUnits,
            enemySpawns,
            localPlayerId: playerId,
            terrainManager,
        });

        // Set terrain on renderer (will be cached as a sprite)
        renderer.setTerrain(terrainGrid);

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

            // Host: save game state snapshot
            if (isHost) {
                saveSnapshot(engine);
            }

            // If not our turn: start polling for orders
            if (info.ownerId !== playerId) {
                startOrderPolling(engine.snapshotIndex);
            }
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

        // Apply locally and resume
        engine.applyOrder(order);
        setWaitingForOrders(null);
        setIsPaused(false);
        pendingMovePathRef.current = null;
        updateCardState(engine);

        // Save order to server
        saveOrder(engine.snapshotIndex, order);

        // Notify other clients
        lobbyClient.sendMessage(lobbyId, playerId, 'battle_orders_ready', {
            snapshotIndex: engine.snapshotIndex,
        }).catch(() => {});
    }

    // ========================================================================
    // Server sync: snapshots and orders
    // ========================================================================

    async function saveSnapshot(engine: GameEngine) {
        try {
            await lobbyClient.saveGameStateSnapshot(
                lobbyId, gameId, engine.snapshotIndex,
                engine.toJSON() as unknown as Record<string, unknown>,
            );
        } catch (err) {
            console.error('Failed to save snapshot:', err);
        }
    }

    async function saveOrder(snapshotIndex: number, order: BattleOrder) {
        try {
            await lobbyClient.saveGameOrders(
                lobbyId, gameId, snapshotIndex,
                order as unknown as Record<string, unknown>,
            );
        } catch (err) {
            console.error('Failed to save order:', err);
        }
    }

    function startOrderPolling(snapshotIndex: number) {
        stopOrderPolling();
        orderPollRef.current = setInterval(async () => {
            try {
                const orders = await lobbyClient.getGameOrders(lobbyId, gameId, snapshotIndex);
                if (orders) {
                    // Orders received! Apply and resume.
                    const engine = engineRef.current;
                    if (engine) {
                        engine.applyOrder(orders as unknown as BattleOrder);
                        setWaitingForOrders(null);
                        setIsPaused(false);
                        updateCardState(engine);
                    }
                    stopOrderPolling();
                }
            } catch {
                // Silently retry
            }
        }, 1000);
    }

    function stopOrderPolling() {
        if (orderPollRef.current) {
            clearInterval(orderPollRef.current);
            orderPollRef.current = null;
        }
    }

    async function performSyncCheck(engine: GameEngine) {
        try {
            const serverState = await lobbyClient.getGameStateSnapshot(lobbyId, gameId);
            if (!serverState) return;

            const local = engine.toJSON();
            const server = serverState as Record<string, unknown>;

            // Compare key fields
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
