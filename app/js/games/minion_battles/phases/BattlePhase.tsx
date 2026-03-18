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
import type { WaitingForOrders, BattleOrder, ResolvedTarget } from '../engine/types';
import { resolveClick, validateAndResolveTarget } from '../abilities/targeting';
import type { AbilityStatic } from '../abilities/Ability';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import { TerrainManager } from '../terrain/TerrainManager';
import { TERRAIN_PROPERTIES } from '../terrain/TerrainType';
import BattleCanvas from '../components/BattleCanvas';
import CardHand from '../components/CardHand';
import RoundProgressBar from '../components/RoundProgressBar';
import TurnIndicator from '../components/TurnIndicator';
import BattleTimeline from '../components/BattleTimeline';
import { throwError } from '../utils/errors';
import { diffSnapshotFields } from '../utils/snapshotDiff';
import { MessageType } from '../../../MessageTypes';
import type { MessageEntry } from '../../../components/Chat';

declare global {
    interface Window {
        __minionBattlesDebugMouse?: {
            worldX: number;
            worldY: number;
            row: number;
            col: number;
            terrainName: string;
        };
    }
}

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
    /** Called when victory is achieved. Passes mission result from the winning victory check. */
    onVictory?: (missionResult: string) => void;
    /** Called when defeat is achieved (all player units dead). */
    onDefeat?: () => void;
    /** Called when host sends an emitted message (NPC or chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
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
    onVictory,
    onDefeat,
    onEmittedChatMessage,
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
    const mouseWorldRef = useRef({ x: 0, y: 0 });
    const targetingStateRef = useRef<{
        selectedAbility: AbilityStatic | null;
        currentTargets: ResolvedTarget[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: WaitingForOrders | null;
    }>({ selectedAbility: null, currentTargets: [], mouseWorld: { x: 0, y: 0 }, waitingForOrders: null });
    targetingStateRef.current = { selectedAbility, currentTargets, mouseWorld: mouseWorldRef.current, waitingForOrders };
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

        // Get mission config and terrain first so we can size the camera to the level
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const worldWidth = terrainGrid.worldWidth;
        const worldHeight = terrainGrid.worldHeight;

        // Create renderer and camera (world size = columns × cellSize, rows × cellSize)
        const renderer = new GameRenderer();
        const camera = new Camera(800, 600, worldWidth, worldHeight);
        rendererRef.current = renderer;
        cameraRef.current = camera;
        renderer.setTerrain(terrainGrid);
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);

        const init = initialGameState as Record<string, unknown> | null | undefined;
        const hasSnapshot = init && Array.isArray(init.units) && (init.units as unknown[]).length > 0 && typeof (init.gameTick ?? init.game_tick) === 'number';

        let engine: GameEngine;
        if (hasSnapshot && init) {
            engine = GameEngine.fromJSON(init as unknown as SerializedGameState, playerId, terrainManager);
            engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
            // Set level events without clearing fired indices so already-fired spawn waves do not re-fire
            if (mission.levelEvents && mission.levelEvents.length > 0) {
                engine.setLevelEvents(mission.levelEvents);
            }
            setRoundNumber(engine.roundNumber);
            setRoundProgress(engine.roundProgress);
            setWaitingForOrders(engine.waitingForOrders);
            if (engine.waitingForOrders) setIsPaused(true);
        } else {
            engine = new GameEngine();
            engine.prepareForNewGame({
                localPlayerId: playerId,
                terrainManager,
                isHost,
                aiControllerId: mission.aiController,
            });
            engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
            const selections = Object.keys(characterSelections).length > 0
                ? characterSelections
                : ((init?.characterSelections ?? init?.character_selections) as Record<string, string>) ?? {};
            const portraitIds = (init?.characterPortraitIds ?? init?.character_portrait_ids) as Record<string, string> | undefined;
            const playerUnits = Object.entries(selections).map(([pid]) => ({
                playerId: pid,
                name: players[pid]?.name ?? 'Unknown',
                portraitId: portraitIds?.[pid],
            }));
            // Backend sets playerEquipmentByPlayer only when characterSelections exist and each
            // CharacterManager.getCharacter(characterId) returns a character. Empty when: (1) no
            // characterSelections in state, (2) every character lookup fails (wrong ID, or no
            // storage/characters/<id>.json). BaseMissionDef applies a hand fallback when this is {}.
            const equippedItemsByPlayer = (init?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
            mission.initializeGameState(engine, {
                playerUnits,
                localPlayerId: playerId,
                eventBus: engine.eventBus,
                terrainManager,
                equippedItemsByPlayer,
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

                if (diffPaths.length === 0) {
                    return;
                }

                // Only treat differences in core simulation state as critical; allow
                // benign drift in bookkeeping fields (waitingForOrders, snapshotIndex,
                // timestamps, etc.) without forcing a rollback for clients.
                const CRITICAL_PREFIXES = ['units', 'projectiles', 'effects', 'specialTiles', 'cards'];
                const criticalDiffs = diffPaths.filter((p) =>
                    CRITICAL_PREFIXES.some(
                        (prefix) =>
                            p === prefix ||
                            p.startsWith(`${prefix}.`) ||
                            p.startsWith(`${prefix}[`),
                    ),
                );

                if (criticalDiffs.length === 0) {
                    return;
                }

                throwError({
                    severity: 'medium',
                    message: 'Client Snapshot desync',
                    details: { fields: diffPaths },
                });
                await reloadEngineFromSnapshot(snapshot);
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
            // Set level events without clearing fired indices so spawn waves do not re-fire
            if (mission.levelEvents && mission.levelEvents.length > 0) {
                newEngine.setLevelEvents(mission.levelEvents);
            }
            oldEngine.destroy();
            engineRef.current = newEngine;

            newEngine.setOnWaitingForOrders((info) => {
                setWaitingForOrders(info);
                setIsPaused(true);

                const unit = newEngine.getUnit(info.unitId);
                const existingPath = unit?.pathInvalidated ? undefined : unit?.movement?.path;
                pendingMovePathRef.current = existingPath && existingPath.length > 0
                    ? existingPath.map((p) => ({ ...p }))
                    : null;
                updateCardState(newEngine);
                if (info.ownerId !== playerId) {
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
            });
            newEngine.setOnStateChanged(() => {
                setRoundProgress(newEngine.roundProgress);
                setRoundNumber(newEngine.roundNumber);
            });

            newEngine.setOnEmitMessage((text, npcId) => {
                if (!isHost) return;
                const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
                    if (res.chatEntry) onEmittedChatMessage?.(res.chatEntry as MessageEntry);
                };
                if (npcId) {
                    lobbyClient.sendMessage(lobbyId, playerId, MessageType.NPC_CHAT, { npcId, message: text }).then(onSent).catch(() => {});
                } else {
                    lobbyClient.sendMessage(lobbyId, playerId, MessageType.CHAT, { message: text }).then(onSent).catch(() => {});
                }
            });
            if (onVictory) newEngine.setOnVictory(onVictory);
            if (onDefeat) newEngine.setOnDefeat(onDefeat);

            setRoundNumber(newEngine.roundNumber);
            setRoundProgress(newEngine.roundProgress);
            setWaitingForOrders(newEngine.waitingForOrders);
            updateCardState(newEngine);

            const myUnit = newEngine.getLocalPlayerUnit();
            if (myUnit && cameraRef.current) {
                cameraRef.current.snapTo(myUnit.x, myUnit.y, myUnit.radius);
            }
            newEngine.start();
        }

        // Set up callbacks
        engine.setOnWaitingForOrders((info) => {
            setWaitingForOrders(info);
            setIsPaused(true);

            // Preserve the unit's existing movement path so it carries over
            // into the next order (unit keeps walking between turns).
            // Do not reuse path after forced movement (knockback, abilities).
            const unit = engine.getUnit(info.unitId);
            const existingPath = unit?.pathInvalidated ? undefined : unit?.movement?.path;
            pendingMovePathRef.current = existingPath && existingPath.length > 0
                ? existingPath.map((p) => ({ ...p }))
                : null;

            updateCardState(engine);

            if (info.ownerId !== playerId) {
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
        });

        engine.setOnStateChanged(() => {
            setRoundProgress(engine.roundProgress);
            setRoundNumber(engine.roundNumber);
        });

        engine.setOnEmitMessage((text, npcId) => {
            if (!isHost) return;
            const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
                if (res.chatEntry) onEmittedChatMessage?.(res.chatEntry as MessageEntry);
            };
            if (npcId) {
                lobbyClient.sendMessage(lobbyId, playerId, MessageType.NPC_CHAT, { npcId, message: text }).then(onSent).catch(() => {});
            } else {
                lobbyClient.sendMessage(lobbyId, playerId, MessageType.CHAT, { message: text }).then(onSent).catch(() => {});
            }
        });

        if (onVictory) {
            engine.setOnVictory(onVictory);
        }
        if (onDefeat) {
            engine.setOnDefeat(onDefeat);
        }

        // Snap camera to player's unit
        const myUnit = engine.getLocalPlayerUnit();
        if (myUnit) {
            camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
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
        // Clicking an already-selected card should deselect it and clear targeting.
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
            submitOrder(engine, selectedAbility.id, newTargets);
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
        }
    }, [selectedAbility, currentTargets, isMyTurn, waitingForOrders]);

    const handleCanvasMouseMove = useCallback((screenX: number, screenY: number) => {
        const engine = engineRef.current;
        const camera = cameraRef.current;
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

        // Clamp to world bounds (from terrain: cols × cellSize, rows × cellSize)
        const worldWidth = engine.getWorldWidth();
        const worldHeight = engine.getWorldHeight();
        const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
        const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));

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
        // Clear targeting preview immediately so it doesn't linger between frames
        targetingStateRef.current.selectedAbility = null;
        targetingStateRef.current.currentTargets = [];
        targetingStateRef.current.waitingForOrders = null;
        setWaitingForOrders(null);
        setIsPaused(false);
        pendingMovePathRef.current = null;
        updateCardState(engine);

        const atTick = engine.gameTick + 1; // order is scheduled for next tick
        saveOrder(atTick, order);

        // Host: save snapshot when a player has submitted their actions so others can sync
        if (isHost) {
            saveCheckpoint(engine.gameTick, engine.toJSON() as unknown as Record<string, unknown>, [...engine.pendingOrders]);
        }

        lobbyClient.sendMessage(lobbyId, playerId, 'battle_orders_ready', {
            snapshotIndex: engine.snapshotIndex,
        }).catch(() => {});
    }

    // ========================================================================
    // Server sync: checkpoints (on turn start) and orders
    // ========================================================================

    async function saveCheckpoint(gameTick: number, state: Record<string, unknown>, orders: OrderAtTick[]) {
        try {
            const ordersFormatted = orders.map((o) => ({ gameTick: o.gameTick, order: o.order as unknown as Record<string, unknown> }));
            await lobbyClient.saveGameStateSnapshot(
                lobbyId, gameId, gameTick,
                state,
                ordersFormatted,
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

            {/* Game canvas */}
            <BattleCanvas
                engine={engine}
                camera={camera}
                renderer={renderer}
                targetingStateRef={targetingStateRef}
                onCanvasClick={handleCanvasClick}
                onCanvasRightClick={handleCanvasRightClick}
                onCanvasMouseMove={handleCanvasMouseMove}
            />

            {/* Turn indicator: Your Turn / Ally's Turn / playing (collapsed) */}
            <TurnIndicator
                state={
                    !waitingForOrders ? 'playing' : isMyTurn ? 'your_turn' : 'ally_turn'
                }
                allyName={waitingForOrders && !isMyTurn ? players[waitingForOrders.ownerId]?.name ?? 'Player' : undefined}
            />

            {/* Upcoming actions timeline (enemies + players) */}
            <BattleTimeline
                engine={engine}
                players={players}
                localPlayerId={playerId}
                previewAbility={isMyTurn ? selectedAbility : null}
            />

            {/* Card hand */}
            <CardHand
                cards={myCards}
                playerUnit={playerUnit}
                isMyTurn={isMyTurn}
                selectedCardIndex={selectedCardIndex}
                onSelectCard={handleSelectCard}
                onWait={handleWait}
                gameTime={engine.gameTime}
            />
        </div>
    );
}
