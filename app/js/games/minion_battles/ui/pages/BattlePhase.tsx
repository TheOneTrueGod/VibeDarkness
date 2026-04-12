/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates the GameEngine, PixiJS canvas, card hand, round tracking,
 * targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { PlayerState, GameSidebarInfo, GameStatePayload } from '../../../../types';
import type { LobbyClient } from '../../../../LobbyClient';
import { GameEngine, CHECKPOINT_INTERVAL } from '../../game/GameEngine';
import type { CardInstance } from '../../game/GameEngine';
import { GameRenderer } from '../../game/GameRenderer';
import type { OrderAtTick, SerializedGameState } from '../../game/types';
import { Camera } from '../../game/Camera';
import type { WaitingForOrders, BattleOrder, ResolvedTarget } from '../../game/types';
import { resolveClick, validateAndResolveTarget } from '../../abilities/targeting';
import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityTargets } from '../../abilities/Ability';
import { getAbility } from '../../abilities/AbilityRegistry';
import { MISSION_MAP, DARK_AWAKENING } from '../../storylines';
import { SPECTATOR_ID } from '../../state';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES } from '../../terrain/TerrainType';
import BattleCanvas from '../components/BattleCanvas';
import CardHand from '../components/CardHand';
import RoundProgressBar from '../components/RoundProgressBar';
import TurnIndicator from '../components/TurnIndicator';
import BattleTimeline from '../components/BattleTimeline';
import { MessageType } from '../../../../MessageTypes';
import type { MessageEntry } from '../../../../components/Chat';
import { useGameSyncOptional } from '../../../../contexts/GameSyncContext';
import type { BattleCallbacks } from '../../../../contexts/GameSyncContext';
import { computeSynchash } from '../../../../utils/synchash';

/** Parameters for {@link loadGameState}; kept in a ref so mount and full-resync use latest values. */
interface LoadGameStateParams {
    lobbyClient: LobbyClient;
    lobbyId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    missionId: string;
    rendererRef: React.MutableRefObject<GameRenderer | null>;
    engineRef: React.MutableRefObject<GameEngine | null>;
    cameraRef: React.MutableRefObject<Camera | null>;
    gameSyncRef: React.MutableRefObject<ReturnType<typeof useGameSyncOptional> | null>;
    setRoundNumber: React.Dispatch<React.SetStateAction<number>>;
    setRoundProgress: React.Dispatch<React.SetStateAction<number>>;
    setWaitingForOrders: React.Dispatch<React.SetStateAction<WaitingForOrders | null>>;
    setIsPaused: React.Dispatch<React.SetStateAction<boolean>>;
    handleWaitingForOrdersState: (
        engine: GameEngine,
        info: WaitingForOrders,
        source: 'engine_callback' | 'post_full_state_sync',
    ) => void;
    updateCardStateRef: React.MutableRefObject<((engine: GameEngine) => void) | null>;
    onVictory?: (missionResult: string) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

/**
 * Builds terrain, camera, and engine from `init` (or fresh mission state),
 * wires callbacks, and starts the simulation. Reuses `GameRenderer` across loads; destroys the previous engine only.
 * @returns Cleanup that destroys the current engine and renderer (see refs at unmount).
 */
function loadGameState(
    ctx: LoadGameStateParams,
    init: Record<string, unknown> | null | undefined,
): () => void {
    ctx.lobbyClient.setCurrentPlayerId(ctx.playerId);

    const prevEngine = ctx.engineRef.current;
    let renderer = ctx.rendererRef.current;
    if (!renderer) {
        renderer = new GameRenderer();
        ctx.rendererRef.current = renderer;
    }
    if (prevEngine) {
        renderer.unbindFromEngine(prevEngine);
    }
    prevEngine?.destroy();
    ctx.engineRef.current = null;
    ctx.cameraRef.current = null;

    const mission = MISSION_MAP[ctx.missionId] ?? DARK_AWAKENING;
    const terrainGrid = mission.createTerrain();
    const terrainManager = new TerrainManager(terrainGrid);
    const worldWidth = terrainGrid.worldWidth;
    const worldHeight = terrainGrid.worldHeight;

    const camera = new Camera(800, 600, worldWidth, worldHeight);
    ctx.cameraRef.current = camera;
    renderer.setTerrain(terrainGrid);
    renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);

    const initRecord = init as Record<string, unknown> | null | undefined;
    const hasSnapshot =
        initRecord &&
        Array.isArray(initRecord.units) &&
        (initRecord.units as unknown[]).length > 0 &&
        typeof (initRecord.gameTick ?? initRecord.game_tick) === 'number';

    let engine: GameEngine;
    if (hasSnapshot && initRecord) {
        engine = GameEngine.fromJSON(initRecord as unknown as SerializedGameState, ctx.playerId, terrainManager);
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        if (mission.levelEvents && mission.levelEvents.length > 0) {
            engine.setLevelEvents(mission.levelEvents);
        }
        ctx.setRoundNumber(engine.roundNumber);
        ctx.setRoundProgress(engine.roundProgress);
        ctx.setWaitingForOrders(engine.waitingForOrders);
        if (engine.waitingForOrders) {
            ctx.setIsPaused(true);
        }
    } else {
        engine = new GameEngine();
        engine.prepareForNewGame({
            localPlayerId: ctx.playerId,
            terrainManager,
            isHost: ctx.isHost,
            aiControllerId: mission.aiController,
        });
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        const selections =
            Object.keys(ctx.characterSelections).length > 0
                ? ctx.characterSelections
                : ((initRecord?.characterSelections ?? initRecord?.character_selections) as Record<string, string>) ?? {};
        const portraitIds = (initRecord?.characterPortraitIds ?? initRecord?.character_portrait_ids) as
            | Record<string, string>
            | undefined;
        const playerUnits = Object.entries(selections)
            .filter(([, charId]) => charId !== SPECTATOR_ID)
            .map(([pid]) => ({
                playerId: pid,
                name: ctx.players[pid]?.name ?? 'Unknown',
                portraitId: portraitIds?.[pid],
            }));
        const equippedItemsByPlayer = (initRecord?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
        const playerResearchTreesByPlayer =
            (initRecord?.playerResearchTreesByPlayer as Record<string, Record<string, string[]>> | undefined) ?? {};
        mission.initializeGameState(engine, {
            playerUnits,
            characterSelections: selections,
            localPlayerId: ctx.playerId,
            eventBus: engine.eventBus,
            terrainManager,
            equippedItemsByPlayer,
            playerResearchTreesByPlayer,
        });
        engine.setPlayerResearchTreesByPlayer(playerResearchTreesByPlayer);
        engine.synchash = typeof initRecord?.synchash === 'string' ? initRecord.synchash : null;
    }

    ctx.engineRef.current = engine;

    engine.setOnWaitingForOrders((info) => {
        ctx.handleWaitingForOrdersState(engine, info, 'engine_callback');
    });

    engine.setOnCheckpoint((gameTick, state, orders) => {
        const stateForHash = state as unknown as Record<string, unknown>;
        const ordersFormatted = (orders as OrderAtTick[]).map((o) => ({
            gameTick: o.gameTick,
            order: o.order as unknown as Record<string, unknown>,
        }));
        void ctx.gameSyncRef.current?.saveCheckpoint(gameTick, stateForHash, ordersFormatted);
    });

    engine.setOnRoundEnd((rn) => {
        ctx.setRoundNumber(rn + 1);
        ctx.updateCardStateRef.current?.(engine);
    });

    engine.setOnStateChanged(() => {
        ctx.setRoundProgress(engine.roundProgress);
        ctx.setRoundNumber(engine.roundNumber);
    });

    engine.setOnEmitMessage((text, npcId) => {
        if (!ctx.isHost) return;
        const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
            if (res.chatEntry) ctx.onEmittedChatMessage?.(res.chatEntry as MessageEntry);
        };
        if (npcId) {
            ctx.lobbyClient
                .sendMessage(ctx.lobbyId, ctx.playerId, MessageType.NPC_CHAT, { npcId, message: text })
                .then(onSent)
                .catch(() => { });
        } else {
            ctx.lobbyClient
                .sendMessage(ctx.lobbyId, ctx.playerId, MessageType.CHAT, { message: text })
                .then(onSent)
                .catch(() => { });
        }
    });

    if (ctx.onVictory) {
        engine.setOnVictory(ctx.onVictory);
    }
    if (ctx.onDefeat) {
        engine.setOnDefeat(ctx.onDefeat);
    }

    const myUnit = engine.getLocalPlayerUnit();
    if (myUnit) {
        camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
    }

    ctx.updateCardStateRef.current?.(engine);

    if (!engine.waitingForOrders) {
        engine.isPaused = false;
    }

    engine.start();

    if (engine.synchash == null) {
        void computeSynchash(engine.toJSON() as unknown as Record<string, unknown>).then((h) => {
            if (ctx.engineRef.current !== engine) return;
            engine.synchash = h;
        });
    }

    return () => {
        ctx.engineRef.current?.destroy();
        ctx.engineRef.current = null;
        ctx.rendererRef.current?.destroy();
        ctx.rendererRef.current = null;
        ctx.cameraRef.current = null;
    };
}

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
    const gameSync = useGameSyncOptional();
    const canSubmitOrders = gameSync?.canSubmitOrders ?? true;

    // Keep a ref so engine callbacks (inside the mount effect) always access latest context
    const gameSyncRef = useRef(gameSync);
    gameSyncRef.current = gameSync;

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
    const prevSyncStatusRef = useRef<string | null>(null);

    // Is it my turn?
    const isMyTurn = waitingForOrders?.ownerId === playerId;

    // ========================================================================
    // Debug unit focus/outline bridge (DebugConsole -> Pixi world)
    // ========================================================================
    useEffect(() => {
        window.__minionBattlesDebugSetUnitHover = (unitId: string | null) => {
            // Highlight in Pixi world.
            rendererRef.current?.setDebugUnitOutline(unitId);

            if (!unitId) {
                // Allow camera auto-follow to resume.
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now();
                return;
            }

            // Attempt to snap camera to the unit.
            const engine = engineRef.current;
            const camera = cameraRef.current;
            if (!engine || !camera) return;
            const unit = engine.getUnit(unitId);
            if (!unit) return;

            camera.snapTo(unit.x, unit.y, unit.radius);
            // Pause auto-follow centering briefly so the snap doesn't immediately get lerped back.
            window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 2500;
        };

        return () => {
            if (rendererRef.current) rendererRef.current.setDebugUnitOutline(null);
            window.__minionBattlesDebugSetUnitHover = undefined;
            window.__minionBattlesDebugAutoFollowPausedUntil = undefined;
            window.__minionBattlesDebugGameTick = undefined;
            window.__minionBattlesDebugGameState = undefined;
        };
        // Intentionally exclude refs from deps: we always want to use latest .current values.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Expose live game tick, engine state, and synchash for DebugConsole tabs
    useEffect(() => {
        let hashSeq = 0;
        const id = window.setInterval(() => {
            const engine = engineRef.current;
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

    // Get the player's unit from the engine
    const playerUnit = useMemo(() => {
        return engineRef.current?.getLocalPlayerUnit() ?? null;
    }, [waitingForOrders, roundNumber]); // re-evaluate when state changes

    // ========================================================================
    // Sidebar info (turn indicator + player health)
    // ========================================================================

    const onSidebarInfoChangeRef = useRef(onSidebarInfoChange);
    onSidebarInfoChangeRef.current = onSidebarInfoChange;
    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => {
        const update = () => {
            const engine = engineRef.current;
            if (!engine || !onSidebarInfoChangeRef.current) return;
            const currentPlayers = playersRef.current;

            const playerUnits = engine.units
                .filter((u) => u.isPlayerControlled())
                .map((u) => ({
                    playerId: u.ownerId,
                    playerName: currentPlayers[u.ownerId]?.name ?? 'Unknown',
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
    }, [isMyTurn, roundNumber]);

    // Clear sidebar info on unmount
    useEffect(() => {
        return () => {
            onSidebarInfoChangeRef.current?.(null);
        };
    }, []);

    // ========================================================================
    // Initialize engine
    // ========================================================================

    const updateCardStateRef = useRef<((engine: GameEngine) => void) | null>(null);
    const loadGameStateParamsRef = useRef<LoadGameStateParams | null>(null);

    const handleWaitingForOrdersState = useCallback(
        (engine: GameEngine, info: WaitingForOrders, _source: 'engine_callback' | 'post_full_state_sync') => {
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

            updateCardStateRef.current?.(engine);
        },
        [],
    );

    /** Battle sync polls via GameSyncContext; we only register engine snapshot + order delivery. */
    useEffect(() => {
        if (!gameSync) return;

        const callbacks: BattleCallbacks = {
            onFullResync: (gameState: SerializedGameState) => {
                const params = loadGameStateParamsRef.current;
                if (!params) return;
                loadGameState(params, gameState as unknown as Record<string, unknown>);
            },
            getEngineSnapshot: () => {
                const eng = engineRef.current;
                if (!eng) return null;
                const w = eng.waitingForOrders;
                return {
                    gameTick: eng.gameTick,
                    state: eng.toJSON() as unknown as Record<string, unknown>,
                    waitingForOrders: w
                        ? { unitId: w.unitId, ownerId: w.ownerId }
                        : null,
                    synchash: eng.synchash,
                };
            },
            onOrdersReceived: (orders) => {
                const eng = engineRef.current;
                if (!eng) return;
                for (const { gameTick: atTick, order } of orders) {
                    eng.queueOrder(atTick, order as unknown as BattleOrder);
                }
                eng.resumeAfterOrders();
                setWaitingForOrders(null);
                setIsPaused(false);
                updateCardStateRef.current?.(eng);
            },
        };
        gameSync.registerBattleCallbacks(callbacks);
        return () => {
            gameSync.registerBattleCallbacks(null);
        };
        // registerBattleCallbacks is stable; avoid depending on full gameSync object (new ref each render).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameSync?.registerBattleCallbacks]);

    useEffect(() => {
        const skipHandler = () => {
            const engine = engineRef.current;
            if (!engine?.waitingForOrders || !isHost) return;
            engine.applyOrder({
                unitId: engine.waitingForOrders.unitId,
                abilityId: 'wait',
                targets: [],
            });
            engine.resumeAfterOrders();
            setWaitingForOrders(null);
            setIsPaused(false);
            updateCardStateRef.current?.(engine);
            const ordersFormatted = engine.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: o.order as unknown as Record<string, unknown> }));
            void gameSync?.saveCheckpoint(engine.gameTick, engine.toJSON() as unknown as Record<string, unknown>, ordersFormatted);
        };
        gameSync?.registerSkipTurnHandler?.(isHost ? skipHandler : null);
        return () => {
            gameSync?.registerSkipTurnHandler?.(null);
        };
    }, [gameSync?.registerSkipTurnHandler, gameSync?.saveCheckpoint, isHost]);

    useEffect(() => {
        const params = loadGameStateParamsRef.current;
        if (!params) return;
        return loadGameState(params, initialGameState ?? undefined);
    }, []); // Run once on mount

    useEffect(() => {
        const currentSyncStatus = gameSync?.syncStatus ?? null;
        const prevSyncStatus = prevSyncStatusRef.current;
        prevSyncStatusRef.current = currentSyncStatus;

        if (currentSyncStatus !== 'synced') return;
        if (prevSyncStatus !== 'resyncing' && prevSyncStatus !== 'loading') return;

        const engine = engineRef.current;
        if (!engine || !engine.waitingForOrders) return;
        const waiting = engine.waitingForOrders;
        const unit = engine.getUnit(waiting.unitId);
        if (!unit || !engine.shouldPauseForOrders(unit)) return;

        console.debug('[BattlePhase] Replaying waiting-for-orders after full-state sync', {
            fromSyncStatus: prevSyncStatus,
            toSyncStatus: currentSyncStatus,
            gameTick: engine.gameTick,
            waitingForOrders: waiting,
        });
        handleWaitingForOrdersState(engine, waiting, 'post_full_state_sync');
    }, [gameSync?.syncStatus, gameSync?.gameState, handleWaitingForOrdersState]);

    // ========================================================================
    // Card state helper
    // ========================================================================

    function updateCardState(engine: GameEngine) {
        const cards = engine.cards[playerId] ?? [];
        setMyCards([...cards]);
    }
    updateCardStateRef.current = updateCardState;

    loadGameStateParamsRef.current = {
        lobbyClient,
        lobbyId,
        playerId,
        isHost,
        players,
        characterSelections,
        missionId,
        rendererRef,
        engineRef,
        cameraRef,
        gameSyncRef,
        setRoundNumber,
        setRoundProgress,
        setWaitingForOrders,
        setIsPaused,
        handleWaitingForOrdersState,
        updateCardStateRef,
        onVictory,
        onDefeat,
        onEmittedChatMessage,
    };

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
        const caster = waitingForOrders ? engine.getUnit(waitingForOrders.unitId) : undefined;
        const resolvedTargets = getAbilityTargets(selectedAbility, caster, engine);
        const targetDef = resolvedTargets[targetIndex];
        if (!targetDef) return;

        // Validate and resolve
        const resolved = validateAndResolveTarget(targetDef, clickResult);
        if (!resolved) return;

        const newTargets = [...currentTargets, resolved];
        setCurrentTargets(newTargets);

        // Check if all targets are now fulfilled
        if (newTargets.length >= resolvedTargets.length) {
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
                return;
            }
            // Card selection hotkeys: 1 = leftmost, 2 = second, etc.
            const digit = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
            if (digit > 0) {
                const handCards = myCards.filter((c) => c.location === 'hand');
                const index = digit - 1;
                if (index < handCards.length) {
                    const card = handCards[index];
                    const ability = card ? getAbility(card.abilityId) : null;
                    if (ability) {
                        e.preventDefault();
                        handleSelectCard(index, ability);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleWait, handleSelectCard, myCards]);

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
        if (!waitingForOrders || !canSubmitOrders) return;

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
        targetingStateRef.current.selectedAbility = null;
        targetingStateRef.current.currentTargets = [];
        targetingStateRef.current.waitingForOrders = null;
        setWaitingForOrders(null);
        setIsPaused(false);
        pendingMovePathRef.current = null;
        updateCardState(engine);

        // Persist order and checkpoint via GameSyncContext
        const atTick = engine.gameTick + 1;
        const checkpointGameTick = Math.floor(atTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
        const orderRecord: Record<string, unknown> = JSON.parse(JSON.stringify(order));
        gameSync?.submitOrder(checkpointGameTick, atTick, orderRecord);

        const ordersFormatted = engine.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: o.order as unknown as Record<string, unknown> }));
        void gameSync?.saveCheckpoint(engine.gameTick, engine.toJSON() as unknown as Record<string, unknown>, ordersFormatted);

        lobbyClient.sendMessage(lobbyId, playerId, 'battle_orders_ready', {
            snapshotIndex: engine.snapshotIndex,
        }).catch(() => { });
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
                gameState={engine}
                gameTime={engine.gameTime}
            />
        </div>
    );
}
