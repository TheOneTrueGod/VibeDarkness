/**
 * Owns battle runtime objects (engine, camera, renderer), engine lifecycle,
 * order submission, and GameSync bridge hooks — without React.
 */
import type { PlayerState } from '../../../types';
import type { MessageEntry } from '../../../components/Chat';
import type { EngineSnapshot } from '../../../contexts/GameSyncContext';
import { MessageType } from '../../../MessageTypes';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { SPECTATOR_ID } from '../state';
import { TerrainManager } from '../terrain/TerrainManager';
import { computeSynchash } from '../../../utils/synchash';
import { GameEngine, CHECKPOINT_INTERVAL } from './GameEngine';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import type { BattleOrder, OrderAtTick, SerializedGameState, WaitingForOrders } from './types';

export interface BattleSessionConfig {
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    onVictory?: (missionResult: string) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

/** Network bridge from GameSyncContext (checkpoint + order file APIs). */
export interface BattleSessionSyncBridge {
    saveCheckpoint: (
        gameTick: number,
        state: Record<string, unknown>,
        orders: Array<{ gameTick: number; order: Record<string, unknown> }>,
    ) => Promise<string | null>;
    submitOrder: (checkpointGameTick: number, atTick: number, order: Record<string, unknown>) => Promise<void>;
}

export type BattleSessionEvent =
    | {
          type: 'waiting_for_orders';
          engine: GameEngine;
          info: WaitingForOrders;
          source: 'engine_callback' | 'post_full_state_sync';
      }
    | { type: 'round_number'; roundNumber: number }
    | { type: 'round_progress'; progress: number }
    | { type: 'pause_state'; paused: boolean; waitingForOrders: WaitingForOrders | null }
    | { type: 'card_state'; engine: GameEngine };

export type BattleSessionListener = (event: BattleSessionEvent) => void;

export class BattleSession {
    private engine: GameEngine | null = null;
    private camera: Camera | null = null;
    private renderer: GameRenderer | null = null;
    private players: Record<string, PlayerState> = {};
    private characterSelections: Record<string, string> = {};
    private syncBridge: BattleSessionSyncBridge | null = null;
    private readonly listeners = new Set<BattleSessionListener>();

    constructor(private readonly config: BattleSessionConfig) {}

    /** Latest lobby player data for fresh loads and snapshot restores. */
    updateLobbyContext(players: Record<string, PlayerState>, characterSelections: Record<string, string>): void {
        this.players = players;
        this.characterSelections = characterSelections;
    }

    setSyncBridge(sync: BattleSessionSyncBridge | null): void {
        this.syncBridge = sync;
    }

    subscribe(listener: BattleSessionListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(event: BattleSessionEvent): void {
        for (const l of this.listeners) {
            l(event);
        }
    }

    getEngine(): GameEngine | null {
        return this.engine;
    }

    getCamera(): Camera | null {
        return this.camera;
    }

    getRenderer(): GameRenderer | null {
        return this.renderer;
    }

    /**
     * Load from checkpoint JSON or initialize a new mission run.
     * Pass `init` from the server (may include units/gameTick or lobby-only fields).
     */
    load(players: Record<string, PlayerState>, characterSelections: Record<string, string>, init: Record<string, unknown> | null | undefined): void {
        this.updateLobbyContext(players, characterSelections);
        this.teardownEngineAndRendererOnly();

        const { api, playerId, isHost, missionId, onVictory, onDefeat, onEmittedChatMessage } = this.config;
        api.setCurrentPlayerId();

        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }

        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const worldWidth = terrainGrid.worldWidth;
        const worldHeight = terrainGrid.worldHeight;

        const camera = new Camera(800, 600, worldWidth, worldHeight);
        this.camera = camera;
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
            engine = GameEngine.fromJSON(initRecord as unknown as SerializedGameState, playerId, terrainManager);
            engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
            if (mission.levelEvents && mission.levelEvents.length > 0) {
                engine.setLevelEvents(mission.levelEvents);
            }
        } else {
            engine = new GameEngine();
            engine.prepareForNewGame({
                localPlayerId: playerId,
                terrainManager,
                isHost,
                aiControllerId: mission.aiController,
            });
            engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
            const selections =
                Object.keys(characterSelections).length > 0
                    ? characterSelections
                    : ((initRecord?.characterSelections ?? initRecord?.character_selections) as Record<string, string>) ?? {};
            const portraitIds = (initRecord?.characterPortraitIds ?? initRecord?.character_portrait_ids) as
                | Record<string, string>
                | undefined;
            const playerUnits = Object.entries(selections)
                .filter(([, charId]) => charId !== SPECTATOR_ID)
                .map(([pid]) => ({
                    playerId: pid,
                    name: players[pid]?.name ?? 'Unknown',
                    portraitId: portraitIds?.[pid],
                }));
            const equippedItemsByPlayer = (initRecord?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
            const playerResearchTreesByPlayer =
                (initRecord?.playerResearchTreesByPlayer as Record<string, Record<string, string[]>> | undefined) ?? {};
            mission.initializeGameState(engine, {
                playerUnits,
                characterSelections: selections,
                localPlayerId: playerId,
                eventBus: engine.eventBus,
                terrainManager,
                equippedItemsByPlayer,
                playerResearchTreesByPlayer,
            });
            engine.setPlayerResearchTreesByPlayer(playerResearchTreesByPlayer);
            engine.synchash = typeof initRecord?.synchash === 'string' ? initRecord.synchash : null;
        }

        this.engine = engine;

        this.emit({ type: 'round_number', roundNumber: engine.roundNumber });
        this.emit({ type: 'round_progress', progress: engine.roundProgress });
        this.emit({ type: 'pause_state', paused: !!engine.waitingForOrders, waitingForOrders: engine.waitingForOrders });

        engine.setOnWaitingForOrders((info) => {
            this.emit({
                type: 'waiting_for_orders',
                engine,
                info,
                source: 'engine_callback',
            });
        });

        engine.setOnCheckpoint((gameTick, state, orders) => {
            const stateForHash = state as unknown as Record<string, unknown>;
            const ordersFormatted = (orders as OrderAtTick[]).map((o) => ({
                gameTick: o.gameTick,
                order: o.order as unknown as Record<string, unknown>,
            }));
            void this.syncBridge?.saveCheckpoint(gameTick, stateForHash, ordersFormatted);
        });

        engine.setOnRoundEnd((rn) => {
            this.emit({ type: 'round_number', roundNumber: rn + 1 });
            this.emit({ type: 'card_state', engine });
        });

        engine.setOnStateChanged(() => {
            this.emit({ type: 'round_progress', progress: engine.roundProgress });
            this.emit({ type: 'round_number', roundNumber: engine.roundNumber });
        });

        engine.setOnEmitMessage((text, npcId) => {
            if (!isHost) return;
            const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
                if (res.chatEntry) onEmittedChatMessage?.(res.chatEntry as MessageEntry);
            };
            if (npcId) {
                api.sendMessage(MessageType.NPC_CHAT, { npcId, message: text }).then(onSent).catch(() => {});
            } else {
                api.sendMessage(MessageType.CHAT, { message: text }).then(onSent).catch(() => {});
            }
        });

        if (onVictory) {
            engine.setOnVictory(onVictory);
        }
        if (onDefeat) {
            engine.setOnDefeat(onDefeat);
        }

        const myUnit = engine.getLocalPlayerUnit();
        if (myUnit) {
            camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
        }

        this.emit({ type: 'card_state', engine });

        if (!engine.waitingForOrders) {
            engine.isPaused = false;
        }

        engine.start();

        if (engine.synchash == null) {
            void computeSynchash(engine.toJSON() as unknown as Record<string, unknown>).then((h) => {
                if (this.engine !== engine) return;
                engine.synchash = h;
            });
        }
    }

    /** Replace simulation from a full serialized snapshot (host resync / reconnect). */
    loadFromSnapshot(gameState: SerializedGameState): void {
        this.load(this.players, this.characterSelections, gameState as unknown as Record<string, unknown>);
    }

    /** Same as {@link load} for a new or reconnecting battle with optional lobby payload. */
    loadFreshMission(init: Record<string, unknown> | null | undefined): void {
        this.load(this.players, this.characterSelections, init);
    }

    /** Snapshot for GameSyncContext polling / hash verification. */
    getSnapshot(): EngineSnapshot | null {
        const eng = this.engine;
        if (!eng) return null;
        const w = eng.waitingForOrders;
        return {
            gameTick: eng.gameTick,
            state: eng.toJSON() as unknown as Record<string, unknown>,
            waitingForOrders: w ? { unitId: w.unitId, ownerId: w.ownerId } : null,
            synchash: eng.synchash,
        };
    }

    /** Apply orders delivered from the server for non-host (or late host) clients. */
    applyRemoteOrders(orders: Array<{ gameTick: number; order: Record<string, unknown> }>): void {
        const eng = this.engine;
        if (!eng) return;
        for (const { gameTick: atTick, order } of orders) {
            eng.queueOrder(atTick, order as unknown as BattleOrder);
        }
        eng.resumeAfterOrders();
        this.emit({ type: 'pause_state', paused: false, waitingForOrders: null });
        this.emit({ type: 'card_state', engine: eng });
    }

    /**
     * Local player submits an order at the current pause point.
     * Caller clears movement preview; session validates against the live engine.
     */
    submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): void {
        const engine = this.engine;
        if (!engine?.waitingForOrders || !opts.canSubmitOrders) return;

        engine.applyOrder(order);
        engine.resumeAfterOrders();
        this.emit({ type: 'pause_state', paused: false, waitingForOrders: null });
        this.emit({ type: 'card_state', engine });

        const atTick = engine.gameTick + 1;
        const checkpointGameTick = Math.floor(atTick / CHECKPOINT_INTERVAL) * CHECKPOINT_INTERVAL;
        const orderRecord: Record<string, unknown> = JSON.parse(JSON.stringify(order));
        void this.syncBridge?.submitOrder(checkpointGameTick, atTick, orderRecord);

        const ordersFormatted = engine.pendingOrders.map((o) => ({
            gameTick: o.gameTick,
            order: o.order as unknown as Record<string, unknown>,
        }));
        void this.syncBridge?.saveCheckpoint(engine.gameTick, engine.toJSON() as unknown as Record<string, unknown>, ordersFormatted);

        this.config.api.sendMessage('battle_orders_ready', { snapshotIndex: engine.snapshotIndex }).catch(() => {});
    }

    /** Host: force a wait order and persist checkpoint (skip turn). */
    skipTurn(): void {
        const engine = this.engine;
        if (!engine?.waitingForOrders || !this.config.isHost) return;
        engine.applyOrder({
            unitId: engine.waitingForOrders.unitId,
            abilityId: 'wait',
            targets: [],
        });
        engine.resumeAfterOrders();
        this.emit({ type: 'pause_state', paused: false, waitingForOrders: null });
        this.emit({ type: 'card_state', engine });
        const ordersFormatted = engine.pendingOrders.map((o) => ({
            gameTick: o.gameTick,
            order: o.order as unknown as Record<string, unknown>,
        }));
        void this.syncBridge?.saveCheckpoint(
            engine.gameTick,
            engine.toJSON() as unknown as Record<string, unknown>,
            ordersFormatted,
        );
    }

    /** Re-emit waiting-for-orders UI after a full-state sync (same tick). */
    replayWaitingForOrdersAfterSync(): void {
        const engine = this.engine;
        if (!engine?.waitingForOrders) return;
        const waiting = engine.waitingForOrders;
        const unit = engine.getUnit(waiting.unitId);
        if (!unit || !engine.shouldPauseForOrders(unit)) return;
        this.emit({
            type: 'waiting_for_orders',
            engine,
            info: waiting,
            source: 'post_full_state_sync',
        });
        this.emit({ type: 'pause_state', paused: true, waitingForOrders: waiting });
    }

    private teardownEngineAndRendererOnly(): void {
        const prevEngine = this.engine;
        const renderer = this.renderer;
        if (prevEngine && renderer) {
            renderer.unbindFromEngine(prevEngine);
        }
        prevEngine?.destroy();
        this.engine = null;
        this.camera = null;
    }

    /** Full teardown (unmount). */
    destroy(): void {
        this.teardownEngineAndRendererOnly();
        this.renderer?.destroy();
        this.renderer = null;
        this.listeners.clear();
        this.syncBridge = null;
    }
}
