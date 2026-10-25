/**
 * Owns battle runtime objects (engine, camera, renderer), engine lifecycle,
 * order submission, and GameSync bridge hooks — without React.
 */
import type { PlayerState } from '../../../types';
import type { MessageEntry } from '../../../components/Chat';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from './types';
import { logToLobbyLogBattleSync, logToLobbyLogForced } from '../../../lobbyLog';
import { GameEngine } from './GameEngine';
import { PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import { PlayerInteractionManager } from './interaction/PlayerInteractionManager';
import { fingerprintToHex, type FingerprintRingEntry } from './Fingerprint';
import { debugSettingsSnapshot } from '../../../debug/debugSettingsStore';
import type {
    ApplyRemoteOrdersResult,
    BattleNet,
    BattleSessionHandle,
    LoadFromSnapshotOpts,
    LocalSyncAnomalyContext,
    RemoteOrderWireRow,
} from './battlenet';
import { DESYNC_PENDING_ORDER_LOG_CAP } from './battlenet/constants';
import { tickStateHistory } from './tickStateHistory';
import { type ResolveActiveDarknessStrengthsInput } from '../../../darknessStrength/resolve';
import type { VictorySnapshot } from '../storylines/victoryHealthConversion';
import { InteractiveTargetingSession, type HeldRemoteOrder } from './interaction/InteractiveTargetingSession';
import { PERF_UI, PERF_UI_REACT, tickPerformanceTracker } from './performance/tickPerformanceTracker';
import type { SimTimeline } from './interaction/simTimeline';
import { bumpEpoch, enterPreview, toCanonical } from './interaction/simTimeline';
import { PreviewEmissionBuffer } from './interaction/PreviewEmissionBuffer';
import { mintCanonicalToken, type CanonicalToken } from './battlenet/canonicalToken';
import { bindEngineCallbacks } from './sessionEngineBinding';
import {
    applyHeldRemoteOrdersFor,
    applyRemoteOrdersFor,
    persistInPlaceCommittedTargetingOrderFor,
    promotePreviewFor,
    submitCommittedTargetingOrderFor,
    submitPlayerOrderFor,
} from './sessionOrders';
import {
    commitPreviewForTerminalOutcome,
    matchHungerLossFor,
    reemitSuppressedTerminalOutcome,
    victorySnapshotFor,
} from './sessionTerminalOutcome';
import { loadSession, loadSessionFromSnapshot, restoreSessionFromInMemorySnapshot } from './sessionLoad';

export interface BattleSessionConfig {
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    onVictory?: (missionResult: string, hungerLoss?: number, snapshot?: VictorySnapshot) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

export interface BattleSessionLoadArgs {
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    battleSeed: number;
    initialSnapshot?: SerializedGameState;
    /**
     * Optional DarknessStrength resolve input (campaign instances + overrides + region/mission).
     * When set on a fresh load, resolved packages are installed before enemy spawn so statBags bake in.
     * Snapshot loads restore active packages from serialized crumbs instead.
     */
    darknessStrength?: ResolveActiveDarknessStrengthsInput;
    /**
     * Host's Darkness Upgrades bag (from `resolveActiveDarknessUpgrades`). Falls back to the
     * initial snapshot's bag so non-host clients get the host's value.
     */
    darknessUpgradeBonuses?: import('../../../researchTrees/types').PassiveBonuses;
    /** Host's active Darkness Upgrade node ids; falls back to the initial snapshot's ids. */
    darknessUpgradeNodeIds?: string[];
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
    | { type: 'card_state'; engine: GameEngine }
    | { type: 'order_submit_failed'; unitId: string; abilityId: string }
    | { type: 'sequential_targeting_rewind' };

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
    /** @internal */
    engine: GameEngine | null = null;
    /** @internal */
    camera: Camera | null = null;
    /** @internal */
    renderer: GameRenderer | null = null;
    private interactionManager: PlayerInteractionManager | null = null;
    private players: Record<string, PlayerState> = {};
    private characterSelections: Record<string, string> = {};
    /** @internal */
    netAdapter: BattleNet | null = null;
    /** @internal */
    initialFingerprint: string | null = null;
    /** @internal */
    initialSerializedState: SerializedGameState | null = null;
    /** Debug-only one-shot: force the next heartbeat fingerprint comparison to mismatch. */
    private forceNextFingerprintMismatch = false;
    private readonly listeners = new Set<BattleSessionListener>();
    /** Dedupe keys for remote rows applied this engine lifetime (cleared when the engine is torn down or replaced from snapshot). */
    /** @internal */
    appliedRemoteOrderKeys = new Set<string>();
    /**
     * Every order with `atTick <= ordersBakedThroughTick` is already part of the loaded engine state
     * (checkpoint envelope tick, or -1 for a fresh tick-0 load). Remote rows in that range are skipped by
     * tick, not by key, so there is no window between `loadFromSnapshot` clearing the keys and the async
     * key seed landing in which a poll could clamp and re-run history (lobby 810373).
     */
    /** @internal */
    ordersBakedThroughTick = -1;
    /**
     * When the UI claims a rewind presentation (DOM crossfade), ITS awaits this before
     * applying orders / unpausing. Headless callers that never defer resolve immediately.
     */
    private rewindPresentationResolve: (() => void) | null = null;
    private rewindPresentationDeferred = false;
    /** Manages the local-preview run for abilities that use SelectTargetDef. */
    readonly interactiveTargeting = new InteractiveTargetingSession();
    /** Ownership model for the interactive sequential targeting preview timeline. */
    /** @internal */
    timeline: SimTimeline = { kind: 'canonical', engineEpoch: 0 };
    /** Buffer for engine emissions during ITS preview; null during canonical timeline. */
    /** @internal */
    previewEmissionBuffer: PreviewEmissionBuffer | null = null;

    constructor(readonly config: BattleSessionConfig) {}

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

    /** @internal */
    emit(event: BattleSessionEvent): void {
        tickPerformanceTracker.measure([PERF_UI, PERF_UI_REACT], () => {
            for (const l of this.listeners) {
                l(event);
            }
        });
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

    /** Ownership model for the interactive sequential targeting preview timeline. */
    getTimeline(): SimTimeline {
        return this.timeline;
    }

    /** Mint a token for persisting state; null if timeline is not canonical (preview in progress). */
    mintCanonicalToken() {
        const timeline = this.timeline;
        if (timeline.kind !== 'canonical') {
            return null;
        }
        return mintCanonicalToken(timeline.engineEpoch);
    }

    /**
     * Mint a token for the in-place commit path during interactive sequential targeting preview.
     * This token is narrowly scoped: it returns a token only when the timeline is a preview
     * with the exact runId, signifying "this order IS the promotion's order".
     * Returns null if the timeline is not preview or the runId doesn't match.
     * Used to allow persistCommittedOrder to POST during preview (gate: this order will promote the timeline).
     */
    mintCommitToken(runId: number): CanonicalToken | null {
        const timeline = this.timeline;
        if (timeline.kind !== 'preview' || timeline.runId !== runId) {
            return null;
        }
        return mintCanonicalToken(timeline.engineEpoch);
    }

    /** Buffer for engine emissions during preview; null during canonical timeline. */
    getPreviewEmissionBuffer(): PreviewEmissionBuffer | null {
        return this.previewEmissionBuffer;
    }

    /**
     * Enter an ITS preview timeline. Called by InteractiveTargetingSession.begin to transition
     * from canonical to preview. The runId is allocated by the caller (typically diagBeginSeq).
     */
    enterItsPreview(runId: number, markTick: number, batchAtTick: number): void {
        this.timeline = enterPreview(this.timeline, { runId, markTick, batchAtTick });
        this.previewEmissionBuffer = new PreviewEmissionBuffer(runId);
    }

    /**
     * Promote a preview timeline to canonical (in-place commit).
     * - Asserts timeline is that preview with matching runId
     * - Clears preview flags (isSequentialTargetingPreview, sequentialTargetingPreviewCast)
     * - Re-binds engine callbacks
     * - Flushes the emission buffer to the network
     *
     * Stale/consumed runIds are logged as diag and treated as no-op.
     */
    promotePreview(runId: number): void {
        return promotePreviewFor(this, runId);
    }

    /**
     * Discard a preview timeline and optionally restore to a mark snapshot.
     * - Asserts timeline is that preview with matching runId
     * - Drops the emission buffer
     * - If mark is provided, restores the engine to that snapshot
     * - Transitions timeline to canonical with bumped epoch
     *
     * Stale/consumed runIds are logged as diag and treated as no-op.
     */
    discardPreview(runId: number, mark?: SerializedGameState): void {
        const timeline = this.timeline;
        if (timeline.kind !== 'preview' || timeline.runId !== runId) {
            this.postBattleSyncLobbyLog(`diag: discardPreview stale runId=${runId}, current timeline=${timeline.kind}`, {
                runId,
                currentTimeline: timeline.kind,
            });
            return;
        }

        this.previewEmissionBuffer = null;
        this.timeline = toCanonical(timeline);
        this.timeline = bumpEpoch(this.timeline);

        if (mark) {
            this.restoreFromInMemorySnapshot(mark);
        }
    }

    /**
     * True when this client is the lobby host and the only player slot in the lobby.
     *
     * Counts every key in `this.players` regardless of `PlayerState.isConnected` — a
     * disconnected peer that has not been removed from lobby state still occupies a slot,
     * so in-place commit stays disabled until the lobby shrinks to the host alone.
     * There is no separate AI-player flag on `PlayerState`; co-op allies appear as
     * additional player entries and also force rollback mode.
     */
    isSoloHost(): boolean {
        if (!this.config.isHost) return false;
        const playerIds = Object.keys(this.players);
        return playerIds.length === 1 && playerIds[0] === this.config.playerId;
    }

    isHost(): boolean {
        return this.config.isHost;
    }

    /** True when BattleNet can accept an order POST/defer (not recovering / awaiting resync ack). */
    isInPlaceCommitPersistenceAvailable(): boolean {
        return this.netAdapter?.isOrderSubmitPathAvailable() ?? false;
    }

    /**
     * True when `atTick` is still a valid server order batch (not already completed on the host).
     * Without a net adapter (tests), always true.
     */
    isOrderBatchTickSubmittable(atTick: number): boolean {
        return this.netAdapter?.isOrderBatchTickSubmittable?.(atTick) ?? true;
    }

    /** Heartbeat parallel order batch; null without a net adapter (tests). */
    getHeartbeatOrderBatchAtTick(): number | null {
        return this.netAdapter?.getHeartbeatOrderBatchAtTick?.() ?? null;
    }

    /**
     * True when the heartbeat expects this player to act (or waiters are unknown).
     * Without a net adapter (tests), always true.
     */
    isLocalPlayerExpectedToAct(): boolean {
        return this.netAdapter?.isLocalPlayerExpectedToAct?.() ?? true;
    }

    /**
     * Best-effort fetch of peer orders before ITS reset/replay/commit. No-op without a net adapter.
     */
    async refreshRemoteOrdersBeforeInteractiveTargetingAction(): Promise<void> {
        await this.netAdapter?.refreshRemoteOrdersForTargetingPreview?.();
    }

    /** Re-bind host engine callbacks after an in-place preview commit (begin() nulls batch-resolved). */
    rebindEngineCallbacks(): void {
        const engine = this.engine;
        if (engine) {
            bindEngineCallbacks(this, engine);
        }
    }

    /** @internal */
    applyPlayerPortraitOverrides(engine: GameEngine, portraitIds: Record<string, string> | undefined): void {
        if (!portraitIds) return;
        for (const unit of engine.units) {
            if (unit.characterId === PLAYER_CHARACTER_ID && unit.isPlayerControlled() && portraitIds[unit.ownerId]) {
                unit.portraitId = portraitIds[unit.ownerId];
            }
        }
    }

    /**
     * Emit pause + waiting_for_orders after preview flags clear (e.g. conditional-cancel in-place commit).
     */
    emitWaitingForOrdersIfPaused(): void {
        const engine = this.engine;
        if (!engine?.waitingForOrders) return;
        this.emit({
            type: 'waiting_for_orders',
            engine,
            info: engine.waitingForOrders,
            source: 'engine_callback',
        });
        this.emit({
            type: 'pause_state',
            paused: true,
            waitingForOrders: engine.waitingForOrders,
        });
    }

    /** Guards re-entry while a terminal-outcome auto-commit is awaiting network. */
    /** @internal */
    terminalPreviewAutoCommitInFlight = false;

    /**
     * Victory/defeat latched during ITS preview playahead. The killing order exists only in the
     * local preview sim, so the outcome must not be surfaced until the order is persisted —
     * otherwise other clients (and the server) never see the kill and desync.
     *
     * Routes through {@link InteractiveTargetingSession.commit}:
     * - In-place commit persists the finalized order, then `reemitSuppressedTerminalOutcome`
     *   fires the victory/defeat UI.
     * - Rollback commit restores the mark (discarding the preview's terminal state) and resubmits
     *   via BattleNet; the outcome re-fires naturally when the authoritative sim reaches the kill.
     * - A failed commit restores the pre-preview pause with no outcome UI — correct, since the
     *   kill never happened authoritatively.
     */
    /** @internal */
    commitPreviewForTerminalOutcome(engine: GameEngine): void {
        return commitPreviewForTerminalOutcome(this, engine);
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
    async load(args: BattleSessionLoadArgs): Promise<void> {
        return loadSession(this, args);
    }

    /**
     * Replace simulation from a full serialized snapshot (host resync / reconnect).
     * `ordersBakedThroughTick` is required: the caller must say which orders the snapshot already contains
     * (checkpoint envelope tick `T` → `T`; tick-0 initial state → -1).
     */
    loadFromSnapshot(gameState: SerializedGameState, opts: LoadFromSnapshotOpts): void {
        loadSessionFromSnapshot(this, gameState, opts);
    }

    /**
     * Restore engine to an in-memory snapshot taken earlier in the same session.
     * Used by {@link InteractiveTargetingSession} to rewind after a local preview run.
     * Unlike {@link loadFromSnapshot}, this does NOT fetch from the server and does NOT
     * save/restore the camera from localStorage — it preserves the current camera directly.
     */
    restoreFromInMemorySnapshot(snapshot: SerializedGameState): void {
        restoreSessionFromInMemorySnapshot(this, snapshot);
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

    /** POST info-level battle-sync line to the lobby log when a lobby client is available. */
    postBattleSyncLobbyLog(message: string, context?: Record<string, unknown>, tick?: number | null): void {
        const { api, playerId } = this.config;
        const lobbyClient = typeof api.getLobbyClient === 'function' ? api.getLobbyClient() : null;
        if (!lobbyClient) return;
        logToLobbyLogBattleSync({
            lobbyClient,
            lobbyId: api.getLobbyId(),
            playerId,
            tick: tick ?? this.getEngineTick(),
            severity: 'info',
            gameId: api.getGameId(),
            message,
            context,
        });
    }

    /**
     * Forced `logType: 'desync'` line — posts even when Debug Console desync/battle-sync floors are off.
     * Used when the live game detects a host mismatch or stuck pause plane.
     */
    postDesyncLobbyLogForced(message: string, context?: Record<string, unknown>, tick?: number | null): void {
        const { api, playerId } = this.config;
        const lobbyClient = typeof api.getLobbyClient === 'function' ? api.getLobbyClient() : null;
        if (!lobbyClient) return;
        logToLobbyLogForced({
            lobbyClient,
            lobbyId: api.getLobbyId(),
            playerId,
            tick: tick ?? this.getEngineTick(),
            severity: 'warn',
            logType: 'desync',
            gameId: api.getGameId(),
            gamePhase: 'battle',
            message,
            context,
        });
    }

    getLocalSyncAnomalyContext(): LocalSyncAnomalyContext {
        const engine = this.engine;
        const waiting = engine?.waitingForOrders ?? null;
        const pending = engine?.pendingOrders ?? [];
        const engineTick = engine?.gameTick ?? 0;
        const atOrAfter = pending
            .filter((row) => row.gameTick >= engineTick)
            .slice(0, DESYNC_PENDING_ORDER_LOG_CAP)
            .map((row) => ({
                gameTick: row.gameTick,
                unitId: row.order.unitId,
                abilityId: row.order.abilityId,
                endTurn: row.order.endTurn === true,
            }));
        return {
            engineTick,
            isPaused: engine?.isPaused === true,
            storyPauseActive: engine?.storyPauseActive === true,
            waitingForTargetInputLabel: engine?.waitingForTargetInput?.label ?? null,
            waitingForOrdersAtTick: waiting?.atTick ?? null,
            waiterUnitIds: waiting?.waiters.map((w) => w.unitId) ?? [],
            itsPreviewActive: this.interactiveTargeting.isActive,
            pendingOrderCount: pending.length,
            pendingOrdersAtOrAfterTick: atOrAfter,
            runtimeFingerprintHex: this.getRuntimeFingerprintHex(),
            fingerprintTailPaused: this.getFingerprintTailPaused(),
        };
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

    isInteractiveTargetingPreviewActive(): boolean {
        return this.timeline.kind === 'preview';
    }

    /** Diagnostics: ITS run/restore counters + engine preview flags for lobby-log correlation. */
    getItsDiagState(): Record<string, unknown> {
        const engine = this.engine;
        return {
            ...this.interactiveTargeting.getDiagState(),
            engineTick: this.getEngineTick(),
            timelineKind: this.timeline.kind,
            engineEpoch: this.timeline.engineEpoch,
            enginePreviewFlag: engine?.isSequentialTargetingPreview === true,
            engineIsPaused: engine?.isPaused === true,
            engineWaitingForOrdersAtTick: engine?.waitingForOrders?.atTick ?? null,
        };
    }

    getLocalPlayerId(): string {
        return this.config.playerId;
    }

    hasDeferredOrderFor(unitId: string, atTick: number): boolean {
        return this.netAdapter?.hasDeferredOrderFor?.(unitId, atTick) ?? false;
    }

    /** True when a wire dedupe key was registered by apply/submit (order consumed or queued). */
    hasRemoteOrderDedupeKey(key: string): boolean {
        return this.appliedRemoteOrderKeys.has(key);
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
        return (this.engine?.state.runtimeFingerprintRing.range(from, to) ?? []).map((entry: FingerprintRingEntry) => ({
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

    /** True when an order at `atTick` is already contained in the loaded engine state. */
    /** @internal */
    isBakedIntoLoadedState(atTick: number): boolean {
        return atTick <= this.ordersBakedThroughTick;
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

    /**
     * Release held remote orders (from {@link InteractiveTargetingSession}) after a preview ends.
     * For each row: skip if the key is already in `appliedRemoteOrderKeys`, queue the order,
     * register the key, then call `tryResumeParallel` once if any row was queued.
     */
    applyHeldRemoteOrders(rows: HeldRemoteOrder[]): void {
        return applyHeldRemoteOrdersFor(this, rows);
    }

    /** Apply orders delivered from the server for non-host (or late host) clients. */
    applyRemoteOrders(orders: RemoteOrderWireRow[]): ApplyRemoteOrdersResult {
        return applyRemoteOrdersFor(this, orders);
    }

    /**
     * Local player submits an order at the current pause point.
     * Caller clears movement preview; session validates against the live engine.
     * Does not advance the engine until BattleNet submit resolves.
     *
     * When USE_SEQUENTIAL_TARGETING is on and the ability has SelectTargetDefs,
     * delegates to InteractiveTargetingSession.begin() instead of submitting immediately.
     */
    async submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): Promise<void> {
        return submitPlayerOrderFor(this, order, opts);
    }

    /**
     * Submit the confirmed order after interactive targeting rollback commit (bypasses begin() routing).
     * @returns true when the order landed (pending row, deferred POST, or registered dedupe after local apply).
     */
    async submitCommittedTargetingOrder(order: BattleOrder, atTick: number): Promise<boolean> {
        return submitCommittedTargetingOrderFor(this, order, atTick);
    }

    /**
     * In-place interactive commit: persist the finalized order without re-applying it locally.
     * Host: append + merge via {@link BattleNet.persistCommittedOrder}.
     * Non-host: POST via {@link BattleNet.submitOrder} with `skipLocalApply` (deferral gates unchanged).
     * Registers the wire dedupe key in {@link appliedRemoteOrderKeys} on success.
     * @param token Optional commit token (minted by caller during preview for in-place commit path).
     */
    async persistInPlaceCommittedTargetingOrder(order: BattleOrder, atTick: number, token?: CanonicalToken | null): Promise<boolean> {
        return persistInPlaceCommittedTargetingOrderFor(this, order, atTick, token);
    }

    /**
     * Re-fire victory/defeat UI callbacks when a terminal result latched during preview
     * (`LevelEventManager.isTerminal`) but was swallowed by `isSequentialTargetingPreview` guards.
     */
    reemitSuppressedTerminalOutcome(engine: GameEngine): void {
        return reemitSuppressedTerminalOutcome(this, engine);
    }

    /** Objective rows and the local player's HP at match end, for the victory popover. */
    /** @internal */
    victorySnapshotFor(engine: GameEngine): VictorySnapshot {
        return victorySnapshotFor(engine);
    }

    /** Positive Hunger lost by the local player this match (see `computeMatchHungerLoss`). */
    /** @internal */
    matchHungerLossFor(engine: GameEngine): number {
        return matchHungerLossFor(engine);
    }

    /** Emit an order_submit_failed event to all session listeners. */
    emitOrderSubmitFailed(unitId: string, abilityId: string): void {
        this.emit({ type: 'order_submit_failed', unitId, abilityId });
    }

    /**
     * Emit a sequential_targeting_rewind event (UI captures the frame before restore).
     * Resolves when the rewind presentation may end — immediately unless the UI calls
     * {@link deferRewindPresentationUntilNotified} synchronously in a listener, then
     * {@link notifyRewindPresentationComplete} after the crossfade.
     */
    emitSequentialTargetingRewind(): Promise<void> {
        const prev = this.rewindPresentationResolve;
        this.rewindPresentationResolve = null;
        this.rewindPresentationDeferred = false;
        prev?.();

        return new Promise((resolve) => {
            this.rewindPresentationResolve = resolve;
            this.emit({ type: 'sequential_targeting_rewind' });
            if (!this.rewindPresentationDeferred) {
                this.rewindPresentationResolve = null;
                resolve();
            }
        });
    }

    /**
     * UI: call from the `sequential_targeting_rewind` handler so ITS holds sim resume
     * until {@link notifyRewindPresentationComplete}.
     */
    deferRewindPresentationUntilNotified(): void {
        this.rewindPresentationDeferred = true;
    }

    /** UI: call when the rewind crossfade finishes (or is cancelled). */
    notifyRewindPresentationComplete(): void {
        const resolve = this.rewindPresentationResolve;
        this.rewindPresentationResolve = null;
        this.rewindPresentationDeferred = false;
        resolve?.();
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
            // Use "any" semantics: if something is queued (even a draft), don't override.
            if (engine.state.orderMgr.hasAnyPendingOrderForUnit(waiter.unitId, atTick)) continue;
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

    /** @internal */
    teardownEngineAndRendererOnly(): void {
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
        tickStateHistory.clear();
    }
}
