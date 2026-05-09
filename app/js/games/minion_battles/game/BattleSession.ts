/**
 * Owns battle runtime objects (engine, camera, renderer), engine lifecycle,
 * order submission, and GameSync bridge hooks — without React.
 */
import type { PlayerState } from '../../../types';
import type { MessageEntry } from '../../../components/Chat';
import { MessageType } from '../../../MessageTypes';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { SPECTATOR_ID } from '../state';
import { TerrainManager } from '../terrain/TerrainManager';
import { debugLog } from '../../../debugLog';
import { GameEngine } from './GameEngine';
import { PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import { fingerprintToHex } from './Fingerprint';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from './types';
import type { BattleNet, BattleSessionHandle } from './BattleNet';

export interface BattleSessionConfig {
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    onVictory?: (missionResult: string) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

export interface BattleSessionLoadArgs {
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    battleSeed: number;
    initialSnapshot?: SerializedGameState;
}

export type BattleSessionEvent =
    | {
          type: 'waiting_for_orders';
          engine: GameEngine;
          info: WaitingForOrders;
          source: 'engine_callback';
      }
    | { type: 'round_number'; roundNumber: number }
    | { type: 'round_progress'; progress: number }
    | { type: 'pause_state'; paused: boolean; waitingForOrders: WaitingForOrders | null }
    | { type: 'card_state'; engine: GameEngine };

export type BattleSessionListener = (event: BattleSessionEvent) => void;

type EngineSnapshot = {
    gameTick: number;
    state: Record<string, unknown>;
    waitingForOrders: {
        waiters: Array<{ unitId: string; ownerId: string }>;
        atTick: number;
    } | null;
    synchash: string | null;
};

export class BattleSession implements BattleSessionHandle {
    private engine: GameEngine | null = null;
    private camera: Camera | null = null;
    private renderer: GameRenderer | null = null;
    private players: Record<string, PlayerState> = {};
    private characterSelections: Record<string, string> = {};
    private netAdapter: BattleNet | null = null;
    private initialFingerprint: string | null = null;
    private initialSerializedState: SerializedGameState | null = null;
    /** Debug-only one-shot: force the next heartbeat fingerprint comparison to mismatch. */
    private forceNextFingerprintMismatch = false;
    private readonly listeners = new Set<BattleSessionListener>();

    constructor(private readonly config: BattleSessionConfig) {}

    /** Latest lobby player data for fresh loads and snapshot restores. */
    updateLobbyContext(players: Record<string, PlayerState>, characterSelections: Record<string, string>): void {
        this.players = players;
        this.characterSelections = characterSelections;
    }

    setNetAdapter(net: BattleNet | null): void {
        this.netAdapter = net;
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

    private applyPlayerPortraitOverrides(engine: GameEngine, portraitIds: Record<string, string> | undefined): void {
        if (!portraitIds) return;
        for (const unit of engine.units) {
            if (unit.characterId === PLAYER_CHARACTER_ID && unit.isPlayerControlled() && portraitIds[unit.ownerId]) {
                unit.portraitId = portraitIds[unit.ownerId];
            }
        }
    }

    private bindEngineCallbacks(engine: GameEngine): void {
        const { api, isHost, onEmittedChatMessage } = this.config;
        engine.setOnCheckpoint((gameTick, state) => {
            if (isHost) {
                void this.netAdapter?.saveSnapshotOnPause(gameTick, state);
            }
        });
        engine.setOnTickComplete((gameTick, fingerprintHex) => {
            if (!isHost) return;
            this.netAdapter?.queueFingerprint(gameTick, fingerprintHex);
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
    }

    private finalizeEngine(engine: GameEngine): void {
        const mission = MISSION_MAP[this.config.missionId] ?? DARK_AWAKENING;
        const { onVictory, onDefeat } = this.config;
        engine.registerBattleObjectives(mission.battleObjectives ?? []);
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
        this.bindEngineCallbacks(engine);
        engine.setOnRoundEnd((rn) => {
            this.emit({ type: 'round_number', roundNumber: rn + 1 });
            this.emit({ type: 'card_state', engine });
        });
        engine.setOnStateChanged(() => {
            this.emit({ type: 'round_progress', progress: engine.roundProgress });
            this.emit({ type: 'round_number', roundNumber: engine.roundNumber });
        });
        if (onVictory) {
            engine.setOnVictory(onVictory);
        }
        if (onDefeat) {
            engine.setOnDefeat(onDefeat);
        }
        const myUnit = engine.getLocalPlayerUnit();
        if (myUnit && this.camera) {
            this.camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
        }
        this.emit({ type: 'card_state', engine });
        if (!engine.waitingForOrders) {
            engine.isPaused = false;
        }
        engine.clearDeferredOrderPauseAndAccumulator();
        engine.start();
    }

    /**
     * Deterministic load: always initialize from mission + seed.
     * Optional initial snapshot is used only for metadata and mismatch fallback.
     */
    async load({ players, characterSelections, battleSeed, initialSnapshot }: BattleSessionLoadArgs): Promise<void> {
        this.updateLobbyContext(players, characterSelections);
        this.teardownEngineAndRendererOnly();
        const { api, playerId, missionId } = this.config;
        api.setCurrentPlayerId();
        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
        this.camera = camera;
        renderer.setTerrain(terrainGrid);
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);

        const snapshotRecord = (initialSnapshot ?? null) as Record<string, unknown> | null;
        const selections =
            Object.keys(characterSelections).length > 0
                ? characterSelections
                : ((snapshotRecord?.characterSelections ?? snapshotRecord?.character_selections) as Record<string, string>) ?? {};
        const portraitIds = (snapshotRecord?.characterPortraitIds ?? snapshotRecord?.character_portrait_ids) as
            | Record<string, string>
            | undefined;
        const displayNamesRaw =
            (snapshotRecord?.characterDisplayNames ?? snapshotRecord?.character_display_names) as
                | Record<string, string>
                | undefined;
        const playerUnits = Object.entries(selections)
            .filter(([, charId]) => charId !== SPECTATOR_ID)
            .map(([pid]) => {
                const dn = displayNamesRaw?.[pid]?.trim();
                const fallback = players[pid]?.name ?? 'Unknown';
                return {
                    playerId: pid,
                    name: dn && dn !== '' ? dn : fallback,
                    portraitId: portraitIds?.[pid],
                };
            });
        const equippedItemsByPlayer = (snapshotRecord?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
        const playerResearchTreesByPlayer =
            (snapshotRecord?.playerResearchTreesByPlayer as Record<string, Record<string, string[]>> | undefined) ?? {};

        const engine = new GameEngine();
        engine.prepareForNewGame({
            localPlayerId: playerId,
            randomSeed: battleSeed,
            terrainManager,
            aiControllerId: mission.aiController,
        });
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        if (mission.levelEvents && mission.levelEvents.length > 0) {
            engine.setLevelEvents(mission.levelEvents);
        }
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
        this.applyPlayerPortraitOverrides(engine, portraitIds);
        this.initialFingerprint = engine.computeInitialFingerprint();
        this.initialSerializedState = engine.toJSON();
        this.finalizeEngine(engine);
    }

    /** Replace simulation from a full serialized snapshot (host resync / reconnect). */
    loadFromSnapshot(gameState: SerializedGameState): void {
        const raw = gameState as unknown as Record<string, unknown>;
        debugLog('sync tracking', 'warn', 'BattleSession.loadFromSnapshot', {
            gameTick: raw.gameTick ?? raw.game_tick,
            snapshotIndex: raw.snapshotIndex,
        });
        this.teardownEngineAndRendererOnly();
        const { api, playerId, missionId } = this.config;
        api.setCurrentPlayerId();
        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
        this.camera = camera;
        renderer.setTerrain(terrainGrid);
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        const engine = GameEngine.fromJSON(gameState, playerId, terrainManager);
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        if (mission.levelEvents && mission.levelEvents.length > 0) {
            engine.setLevelEvents(mission.levelEvents);
        }
        const snapshotPortraitIds = (raw.characterPortraitIds ?? raw.character_portrait_ids) as
            | Record<string, string>
            | undefined;
        this.applyPlayerPortraitOverrides(engine, snapshotPortraitIds);
        this.finalizeEngine(engine);
    }

    /** Same as {@link load} for a new or reconnecting battle with optional lobby payload. */
    loadFreshMission(init: Record<string, unknown> | null | undefined): void {
        const battleSeed = typeof init?.battleSeed === 'number' ? init.battleSeed : 1;
        void this.load({
            players: this.players,
            characterSelections: this.characterSelections,
            battleSeed,
            initialSnapshot: (init as SerializedGameState | undefined) ?? undefined,
        });
    }

    async compareInitialFingerprintWithHeartbeat(headFingerprint: string | null): Promise<boolean> {
        if (headFingerprint == null) return false;
        if (!this.initialFingerprint || headFingerprint === this.initialFingerprint) return false;
        return (await this.netAdapter?.recoverFromLobbyInitialFingerprintMismatch()) ?? false;
    }

    /** Debug helper used by Battle Actions tab to intentionally trigger one desync recovery. */
    triggerDebugDesyncOnce(): void {
        this.forceNextFingerprintMismatch = true;
    }

    getEngineTick(): number {
        return this.engine?.gameTick ?? 0;
    }

    isPausedForOrderSync(): boolean {
        return this.engine?.waitingForOrders != null;
    }

    getLatestFingerprint(): { tick: number; fp: string } | null {
        const latest = this.engine?.state.runtimeFingerprintRing.latest();
        if (!latest) return null;
        const fp = fingerprintToHex(latest.fp);
        if (!this.forceNextFingerprintMismatch) {
            return { tick: latest.tick, fp };
        }
        this.forceNextFingerprintMismatch = false;
        // Deliberately return a different hash for one compare cycle only.
        const forced = fp === 'ffffffffffffffff' ? '0000000000000000' : 'ffffffffffffffff';
        return { tick: latest.tick, fp: forced };
    }

    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string }> {
        return (this.engine?.state.runtimeFingerprintRing.range(from, to) ?? []).map((entry) => ({
            tick: entry.tick,
            fp: fingerprintToHex(entry.fp),
        }));
    }

    getInitialFingerprint(): string {
        return this.initialFingerprint ?? '';
    }

    getSerializedSnapshot(): SerializedGameState {
        if (!this.engine) {
            throw new Error('BattleSession.getSerializedSnapshot called before load');
        }
        return this.engine.toJSON();
    }

    getSerializedInitialState(): SerializedGameState {
        if (this.initialSerializedState) {
            return this.initialSerializedState;
        }
        return this.getSerializedSnapshot();
    }

    /** Snapshot for GameSyncContext polling / hash verification. */
    getSnapshot(): EngineSnapshot | null {
        const eng = this.engine;
        if (!eng) return null;
        const w = eng.waitingForOrders;
        return {
            gameTick: eng.gameTick,
            state: eng.toJSON() as unknown as Record<string, unknown>,
            waitingForOrders: w
                ? { waiters: w.waiters.map((x) => ({ unitId: x.unitId, ownerId: x.ownerId })), atTick: w.atTick }
                : null,
            synchash: eng.getRuntimeFingerprintHex(),
        };
    }

    /** Apply orders delivered from the server for non-host (or late host) clients. */
    applyRemoteOrders(orders: Array<{ gameTick?: number; atTick?: number; order: Record<string, unknown> }>): void {
        const eng = this.engine;
        if (!eng) return;
        debugLog('sync tracking', 'info', 'BattleSession.applyRemoteOrders', {
            engineTickBefore: eng.gameTick,
            count: orders.length,
            queuePlan: orders.map((o) => ({
                atTick: o.atTick ?? o.gameTick,
                unitId: (o.order as { unitId?: string }).unitId,
                abilityId: (o.order as { abilityId?: string }).abilityId,
            })),
        });
        for (const rec of orders) {
            const atTick = rec.atTick ?? rec.gameTick;
            if (typeof atTick !== 'number') continue;
            const order = rec.order;
            eng.queueOrder(atTick, order as unknown as BattleOrder);
        }
        eng.tryResumeParallel();
        this.emit({
            type: 'pause_state',
            paused: !!eng.waitingForOrders,
            waitingForOrders: eng.waitingForOrders,
        });
        this.emit({ type: 'card_state', engine: eng });
    }

    /**
     * Local player submits an order at the current pause point.
     * Caller clears movement preview; session validates against the live engine.
     * Does not advance the engine until BattleNet submit resolves.
     */
    async submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): Promise<void> {
        const engine = this.engine;
        const batch = engine?.waitingForOrders;
        if (!batch || !opts.canSubmitOrders) return;
        if (!batch.waiters.some((w) => w.unitId === order.unitId)) return;

        const atTick = batch.atTick;
        await this.netAdapter?.submitOrder(order, atTick);
    }

    /** Host: force a wait order and persist checkpoint (skip turn). */
    skipTurn(): void {
        const engine = this.engine;
        const batch = engine?.waitingForOrders;
        if (!batch || !this.config.isHost) return;
        const atTick = batch.atTick;
        for (const waiter of batch.waiters) {
            const unit = engine.getUnit(waiter.unitId);
            if (!unit?.isPlayerControlled()) continue;
            if (engine.hasPendingOrderForUnit(waiter.unitId, atTick)) continue;
            engine.queueOrder(atTick, {
                unitId: waiter.unitId,
                abilityId: 'wait',
                targets: [],
            });
        }
        engine.tryResumeParallel();
        this.emit({
            type: 'pause_state',
            paused: !!engine.waitingForOrders,
            waitingForOrders: engine.waitingForOrders,
        });
        this.emit({ type: 'card_state', engine });
        for (const waiter of batch.waiters) {
            if (waiter.ownerId !== this.config.playerId) continue;
            const unit = engine.getUnit(waiter.unitId);
            if (!unit?.isPlayerControlled()) continue;
            void this.netAdapter?.submitOrder(
                {
                    unitId: waiter.unitId,
                    abilityId: 'wait',
                    targets: [],
                },
                atTick,
            );
        }
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
        this.netAdapter = null;
        this.initialFingerprint = null;
        this.initialSerializedState = null;
    }
}
