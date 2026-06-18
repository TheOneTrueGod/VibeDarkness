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
import { getSegment } from '../terrain/segmentRegistry';
import { debugLog } from '../../../debugLog';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../lobbyLog';
import { GameEngine } from './GameEngine';
import { PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import { PlayerInteractionManager } from './interaction/PlayerInteractionManager';
import { fingerprintToHex } from './Fingerprint';
import { debugSettingsSnapshot } from '../../../debug/debugSettingsStore';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from './types';
import type { ApplyRemoteOrdersResult, BattleNet, BattleSessionHandle, RemoteOrderWireRow } from './battlenet';
import { hashOrderId } from './battlenet/helpers/orderHashing';
import { summarizeRemoteWireRowsForLog } from './battlenet/helpers/orderWireLogSummary';
import { logUserState } from './battlenet/userStateLog';

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
          source: 'engine_callback' | 'post_full_state_sync';
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
    private interactionManager: PlayerInteractionManager | null = null;
    private players: Record<string, PlayerState> = {};
    private characterSelections: Record<string, string> = {};
    private netAdapter: BattleNet | null = null;
    private initialFingerprint: string | null = null;
    private initialSerializedState: SerializedGameState | null = null;
    /** Debug-only one-shot: force the next heartbeat fingerprint comparison to mismatch. */
    private forceNextFingerprintMismatch = false;
    private readonly listeners = new Set<BattleSessionListener>();
    /** Dedupe keys for remote rows applied this engine lifetime (cleared when the engine is torn down or replaced from snapshot). */
    private appliedRemoteOrderKeys = new Set<string>();

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

    getInteractionManager(): PlayerInteractionManager | null {
        return this.interactionManager;
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
        engine.setOnTickComplete((gameTick, fingerprintHex, paused, adminReason) => {
            if (isHost) {
                this.netAdapter?.queueFingerprint(gameTick, fingerprintHex, paused, adminReason);
            }
            logUserState({ api, playerId: this.config.playerId, engine, fingerprintHex });
        });
        if (isHost) {
            engine.setOnParallelBatchResolved((batchAtTick) => {
                const merge = this.netAdapter?.mergeAppliedOrdersForBatch(batchAtTick);
                if (merge === undefined || merge === null) {
                    return;
                }
                return Promise.resolve(merge).then((ok) => {
                    if (ok === false) {
                        throw new Error('merge-applied-failed');
                    }
                });
            });
        } else {
            engine.setOnParallelBatchResolved(null);
        }
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
        if (engine.waitingForOrders) {
            this.emit({
                type: 'waiting_for_orders',
                engine,
                info: engine.waitingForOrders,
                source: 'post_full_state_sync',
            });
        } else {
            engine.isPaused = false;
        }
        engine.clearDeferredOrderPauseAndAccumulator();
    }

    /** Start the simulation loop (RAF). Call after host has persisted tick-0 initial state when appropriate. Idempotent with GameEngine.start. */
    startEngine(): void {
        const eng = this.engine;
        if (!eng) {
            return;
        }
        if (this.camera && this.renderer) {
            this.interactionManager?.destroy();
            this.interactionManager = new PlayerInteractionManager();
            this.interactionManager.setContext({
                engine: eng,
                camera: this.camera,
                renderer: this.renderer,
                session: this,
                playerId: this.config.playerId,
            });
        }
        eng.start();
    }

    /**
     * Deterministic load: always initialize from mission + seed.
     * Optional initial snapshot is used only for metadata and mismatch fallback.
     */
    async load({ players, characterSelections, battleSeed, initialSnapshot }: BattleSessionLoadArgs): Promise<void> {
        this.updateLobbyContext(players, characterSelections);
        this.appliedRemoteOrderKeys.clear();
        this.teardownEngineAndRendererOnly();
        const { api, playerId, missionId, isHost } = this.config;
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
        renderer.setTerrain(terrainManager);
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
        const terrainSegmentPOIs = mission.segmentIds.flatMap((id) => getSegment(id)?.pointsOfInterest ?? []);
        mission.initializeGameState(engine, {
            playerUnits,
            characterSelections: selections,
            localPlayerId: playerId,
            eventBus: engine.eventBus,
            terrainManager,
            equippedItemsByPlayer,
            playerResearchTreesByPlayer,
            terrainSegmentPOIs,
        });
        engine.applyInstantLightingPass();
        engine.setPlayerResearchTreesByPlayer(playerResearchTreesByPlayer);
        this.applyPlayerPortraitOverrides(engine, portraitIds);
        this.initialFingerprint = engine.computeInitialFingerprint();
        this.initialSerializedState = engine.toJSON();
        this.finalizeEngine(engine);
        if (isHost && typeof api.getLobbyClient === 'function') {
            const selectionKeys = Object.keys(selections).sort();
            void logToLobbyLog({
                lobbyClient: api.getLobbyClient(),
                lobbyId: api.getLobbyId(),
                playerId,
                tick: 0,
                severity: 'info',
                logType: 'debug',
                gameId: api.getGameId(),
                gamePhase: 'battle',
                message: 'battle initial fingerprint inputs',
                context: {
                    missionId,
                    battleSeed,
                    initialFingerprint: this.initialFingerprint,
                    characterSelectionsOrdered: selectionKeys.map((id) => [id, selections[id]]),
                    equippedItemsByPlayer,
                },
            });
        }
    }

    private static readonly RESYNC_CAMERA_KEY = 'mb_camera_resync_state';

    /** Replace simulation from a full serialized snapshot (host resync / reconnect). */
    loadFromSnapshot(
        gameState: SerializedGameState,
        opts?: { checkpointRuntimeFingerprintHex?: string | null },
    ): void {
        const raw = gameState as unknown as Record<string, unknown>;
        debugLog('sync tracking', 'warn', 'BattleSession.loadFromSnapshot', {
            gameTick: raw.gameTick ?? raw.game_tick,
            snapshotIndex: raw.snapshotIndex,
        });
        if (this.camera) {
            localStorage.setItem(
                BattleSession.RESYNC_CAMERA_KEY,
                JSON.stringify({ x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }),
            );
        }
        this.appliedRemoteOrderKeys.clear();
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
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        const engine = GameEngine.fromJSON(gameState, playerId, terrainManager, opts);
        renderer.setTerrain(terrainManager);
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        if (mission.levelEvents && mission.levelEvents.length > 0) {
            engine.setLevelEvents(mission.levelEvents);
        }
        const snapshotPortraitIds = (raw.characterPortraitIds ?? raw.character_portrait_ids) as
            | Record<string, string>
            | undefined;
        this.applyPlayerPortraitOverrides(engine, snapshotPortraitIds);
        this.finalizeEngine(engine);
        // Replacing the engine calls destroy() on the previous instance, which stops its rAF loop.
        // BattlePhase only calls startEngine() once on mount; async resync paths must restart here.
        this.startEngine();
        const savedCamera = localStorage.getItem(BattleSession.RESYNC_CAMERA_KEY);
        if (savedCamera) {
            localStorage.removeItem(BattleSession.RESYNC_CAMERA_KEY);
            try {
                const { x, y, zoom } = JSON.parse(savedCamera) as { x: number; y: number; zoom: number };
                this.camera.setZoomLevel(zoom);
                this.camera.snapTo(x, y);
            } catch {
                // ignore malformed data
            }
        }
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

    /** Debug helper: reload the battle from the initial state and replay all orders. */
    async replayMissionFromStart(): Promise<void> {
        await this.netAdapter?.replayMissionFromStart();
    }

    getEngineTick(): number {
        return this.engine?.gameTick ?? 0;
    }

    getRuntimeFingerprintHex(): string {
        return this.engine?.getRuntimeFingerprintHex() ?? '';
    }

    getFingerprintTailPaused(): boolean {
        return this.engine?.getFingerprintTailPaused() ?? false;
    }

    isPausedForOrderSync(): boolean {
        return this.engine?.waitingForOrders != null;
    }

    /** Non-host: fixed-step sim is frozen until `gameTick <=` heartbeat host completed tail. */
    isMultiplayerAwaitHostCatchup(): boolean {
        return this.engine?.state.multiplayerAwaitHostCatchup ?? false;
    }

    setMultiplayerAwaitHostCatchup(blocked: boolean): void {
        const eng = this.engine;
        if (!eng) return;
        eng.state.multiplayerAwaitHostCatchup = blocked;
    }

    getWaitingForOrdersBatch(): WaitingForOrders | null {
        return this.engine?.waitingForOrders ?? null;
    }

    isDebugSimulationFrozen(): boolean {
        return debugSettingsSnapshot.debugPauseMode === true;
    }

    /** True while the battle engine loop is running (`GameEngine.start` … `stop`). */
    isEngineSimulationRunning(): boolean {
        return this.engine?.isSimulationLoopRunning ?? false;
    }

    /** `paused`: end-of-tick pause flag mirrored to host fingerprints.jsonl (see `GameEngine` tick end). */
    getLatestFingerprint(): { tick: number; fp: string; paused: boolean } | null {
        const latest = this.engine?.state.runtimeFingerprintRing.latest();
        if (!latest) return null;
        const fp = fingerprintToHex(latest.fp);
        if (!this.forceNextFingerprintMismatch) {
            return { tick: latest.tick, fp, paused: latest.paused };
        }
        this.forceNextFingerprintMismatch = false;
        // Deliberately return a different hash for one compare cycle only.
        const forced = fp === 'ffffffffffffffff' ? '0000000000000000' : 'ffffffffffffffff';
        return { tick: latest.tick, fp: forced, paused: latest.paused };
    }

    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string; paused: boolean }> {
        return (this.engine?.state.runtimeFingerprintRing.range(from, to) ?? []).map((entry) => ({
            tick: entry.tick,
            fp: fingerprintToHex(entry.fp),
            paused: entry.paused,
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

    getPayloadForPersistedInitialStateOrNull(): {
        state: SerializedGameState;
        initialFingerprint: string;
    } | null {
        if (this.initialSerializedState == null) {
            return null;
        }
        const fp = this.initialFingerprint;
        if (fp == null || fp === '') {
            return null;
        }
        return { state: this.initialSerializedState, initialFingerprint: fp };
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
                ? {
                      waiters: w.waiters.map((x) => ({ unitId: x.unitId, ownerId: x.ownerId })),
                      atTick: w.atTick,
                  }
                : null,
            synchash: eng.getRuntimeFingerprintHex(),
        };
    }

    /**
     * Align {@link BattleSession.appliedRemoteOrderKeys} with {@link OrderQueueController.seedAppliedHashesForMergedOrdersThroughTick}.
     */
    seedRemoteOrderDedupeKeys(keys: readonly string[]): void {
        for (const k of keys) {
            if (typeof k === 'string' && k.length > 0) {
                this.appliedRemoteOrderKeys.add(k);
            }
        }
    }

    /** Apply orders delivered from the server for non-host (or late host) clients. */
    applyRemoteOrders(orders: RemoteOrderWireRow[]): ApplyRemoteOrdersResult {
        const newlyAppliedKeys: string[] = [];
        const skippedKeys: string[] = [];
        const eng = this.engine;
        if (!eng) {
            return { newlyAppliedKeys, skippedKeys };
        }
        const engineTickBeforeApply = eng.gameTick;
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
            if (typeof atTick !== 'number' || Number.isNaN(atTick)) {
                continue;
            }
            const idWire = rec.idHash;
            const keyFromWire = typeof idWire === 'string' && idWire.length > 0 ? idWire : null;
            const playerId = typeof rec.playerId === 'string' && rec.playerId.length > 0 ? rec.playerId : null;
            const key =
                keyFromWire ??
                (playerId != null ? hashOrderId(playerId, atTick, rec.order as BattleOrder) : null);
            if (key == null) {
                continue;
            }
            if (this.appliedRemoteOrderKeys.has(key)) {
                skippedKeys.push(key);
                continue;
            }
            const order = rec.order;
            eng.state.orderMgr.queueOrder(atTick, order as unknown as BattleOrder);
            this.appliedRemoteOrderKeys.add(key);
            newlyAppliedKeys.push(key);
        }
        eng.tryResumeParallel();
        this.emit({
            type: 'pause_state',
            paused: !!eng.waitingForOrders,
            waitingForOrders: eng.waitingForOrders,
        });
        this.emit({ type: 'card_state', engine: eng });
        const wAfter = eng.waitingForOrders;
        const lobbyClient = this.config.api.getLobbyClient?.();
        if (orders.length > 0 && lobbyClient) {
            logToLobbyLogBattleSync({
                lobbyClient,
                lobbyId: this.config.api.getLobbyId(),
                playerId: this.config.playerId,
                tick: eng.gameTick,
                severity: 'info',
                gameId: this.config.api.getGameId(),
                message:
                    'BattleSession.applyRemoteOrders: engine state after queueOrder (same effectiveTick+unitId replaces pending row)',
                context: {
                    engineTickBeforeApply,
                    engineTickAfter: eng.gameTick,
                    incomingRows: summarizeRemoteWireRowsForLog(orders),
                    newlyAppliedKeys,
                    skippedKeys,
                    pendingOrdersAfter: eng.pendingOrders.map((o) => ({
                        gameTick: o.gameTick,
                        unitId: o.order.unitId,
                        abilityId: o.order.abilityId,
                    })),
                    waitingForOrdersAfter:
                        wAfter == null
                            ? null
                            : {
                                  atTick: wAfter.atTick,
                                  waiterUnitIds: wAfter.waiters.map((x) => x.unitId),
                              },
                },
            });
        }
        return { newlyAppliedKeys, skippedKeys };
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
            if (engine.state.orderMgr.hasPendingOrderForUnit(waiter.unitId, atTick)) continue;
            engine.state.orderMgr.queueOrder(atTick, {
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
        this.appliedRemoteOrderKeys.clear();
    }

    /** Full teardown (unmount). */
    destroy(): void {
        const net = this.netAdapter;
        this.netAdapter = null;
        if (net != null && typeof (net as { stop?: () => void }).stop === 'function') {
            (net as { stop: () => void }).stop();
        }
        this.interactionManager?.destroy();
        this.interactionManager = null;
        this.teardownEngineAndRendererOnly();
        this.renderer?.destroy();
        this.renderer = null;
        this.listeners.clear();
        this.initialFingerprint = null;
        this.initialSerializedState = null;
    }
}
