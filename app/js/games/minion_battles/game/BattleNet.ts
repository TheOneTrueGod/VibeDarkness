import type { LobbyClient } from '../../../LobbyClient';
import {
    HEARTBEAT_POLL_IDLE_MS,
    HEARTBEAT_POLL_INTERVAL_HIDDEN_MS,
    HEARTBEAT_POLL_INTERVAL_MS,
    BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC,
} from '../../../../../global_constants.js';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../lobbyLog';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from './types';

export interface BattleSessionHandle {
    getEngineTick(): number;
    /** Incremental sim hash at the current engine state (matches tick-complete flush / {@link GameEngine.getRuntimeFingerprintHex}). */
    getRuntimeFingerprintHex(): string;
    /** Same `paused` predicate as tick-complete fingerprint rows ({@link GameEngine.getFingerprintTailPaused}). */
    getFingerprintTailPaused(): boolean;
    getLatestFingerprint(): { tick: number; fp: string; paused: boolean } | null;
    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string; paused: boolean }>;
    getInitialFingerprint(): string;
    getSerializedSnapshot(): SerializedGameState;
    getSerializedInitialState(): SerializedGameState;
    /** Tick-0 baseline for one-time `initial_state.json`; null when restored from checkpoint-only (no in-memory tick 0 blob). */
    getPayloadForPersistedInitialStateOrNull(): {
        state: SerializedGameState;
        initialFingerprint: string;
    } | null;
    startEngine(): void;
    loadFromSnapshot(
        state: SerializedGameState,
        opts?: { checkpointRuntimeFingerprintHex?: string | null },
    ): void;
    applyRemoteOrders(
        orders: Array<{ gameTick?: number; atTick?: number; order: BattleOrder | Record<string, unknown> }>,
    ): void;
    /**
     * True while the engine holds a parallel player order batch (`GameEngine.waitingForOrders`).
     * Distinct from BattleNet HTTP deferral (`deferredLocalOrders`).
     */
    isPausedForOrderSync(): boolean;
    /** Snapshot of {@link GameEngine.waitingForOrders}; null while the sim is not in that pause. */
    getWaitingForOrdersBatch(): WaitingForOrders | null;
    /** True while debug pause freezes the deterministic sim (`debugPauseMode`). */
    isDebugSimulationFrozen(): boolean;
    /** True while the battle engine loop is running (`GameEngine.start` … `stop`). */
    isEngineSimulationRunning(): boolean;
}

export type BattleNetSyncTerminalStatus =
    | 'synced'
    | 'waiting_for_host'
    | 'resyncing'
    | 'failed'
    | 'synced_pending_ack';

type BattleNetEventMap = {
    'sync-status': BattleNetSyncTerminalStatus;
    /** Optional human-readable sync detail shown in Battle UI while recovering. */
    'sync-details': string | null;
    /** Non-host: stuck waiting for host to advance past anchor tick (wall-clock gated UX + resync). */
    'host-anchor-wait': { phase: 'idle' | 'waiting_ui' | 'forcing_resync'; elapsedMs: number };
    /** Non-host: cannot submit parallel orders until host pause plane aligns (pause-ahead desync prevention). */
    'blocking-host-pause-plane': { blocking: boolean };
    /** Non-host: local simulation is behind the server's completed tick. */
    'falling-behind': { active: boolean; ticksBehind: number };
    heartbeat: {
        hostTick: number;
        hostFingerprint: string | null;
        hostPaused: boolean;
        ordersTipTick: number;
        ordersRecordCount: number | null;
        orderBatchAtTick: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq: number;
        pendingOrders?: Array<Record<string, unknown>>;
        appliedOrdersAtTick?: { atTick: number | null; orders: Array<Record<string, unknown>> };
        latestServerGameTick?: number | null;
        latestServerGameHash?: string | null;
        gameTick?: number | null;
        gameHash?: string | null;
        /** Max tick in `fingerprints.jsonl` (unclamped); optional until server ships tail fields. */
        fingerprintTailTick: number | null;
        fingerprintTailFingerprint: string | null;
    };
    'orders-applied': { count: number; source: 'poll' | 'submit' };
    'host-catchup-wait': {
        /** Deferred queue non-empty — block further local submits until flushed. */
        blocking: boolean;
        /** Heartbeat polls spent waiting while paused with a deferred POST. */
        stuckHeartbeats: number;
        hostTick: number;
        targetTick: number | null;
        queuedCount: number;
    };
};

type Listener<K extends keyof BattleNetEventMap> = (payload: BattleNetEventMap[K]) => void;
type Unsub = () => void;

interface BattleApi {
    appendBattleOrder(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; atTick: number; order: BattleOrder; idHash?: string },
    ): Promise<{
        accepted: boolean;
        idHash: string;
        rejectedReason?: string;
        maxAllowedTick?: number;
        minAllowedTick?: number;
        hostTick?: number;
        hostFingerprint?: string | null;
    }>;
    getBattleOrdersRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; sinceTick?: number; untilTick?: number },
    ): Promise<{ orders: Array<{ atTick: number; playerId: string; order: BattleOrder; idHash: string }> }>;
    getBattleSnapshot(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; atTick?: number },
    ): Promise<{ tick: number; state: SerializedGameState; synchash: string | null } | null>;
    getBattleHeartbeat(
        lobbyId: string,
        gameId: string,
        playerId: string,
        opts?: { gameTick?: number },
    ): Promise<{
        hostTick: number | null;
        hostFingerprint: string | null;
        latestServerGameTick?: number | null;
        latestServerGameHash?: string | null;
        gameTick?: number | null;
        gameHash?: string | null;
        pendingOrders?: Array<Record<string, unknown>>;
        appliedOrdersAtTick?: { atTick: number | null; orders: Array<Record<string, unknown>> };
        ordersTipTick: number | null;
        ordersRecordCount?: number | null;
        /** Parallel order batch tick when paused; legacy alias for some payloads: {@link pausedAtTick}. */
        orderBatchAtTick?: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq?: number | null;
        hostPaused?: boolean | null;
        fingerprintTailTick?: number | null;
        fingerprintTailFingerprint?: string | null;
    }>;
    mergeBattleAppliedOrders(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; batchAtTick: number },
    ): Promise<{ success: boolean; merged: number }>;
    saveBattleInitialState(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; state: SerializedGameState; initialFingerprint: string },
    ): Promise<void>;
    getBattleInitialState(
        lobbyId: string,
        gameId: string,
        playerId: string,
    ): Promise<{ state: SerializedGameState; initialFingerprint: string } | null>;
    saveBattleSnapshot(
        lobbyId: string,
        gameId: string,
        body: {
            playerId: string;
            tick: number;
            state: SerializedGameState;
            checkpointFingerprint?: string;
            /** Paired with `checkpointFingerprint` for the co-appended `fingerprints.jsonl` row. */
            checkpointFingerprintPaused?: boolean;
        },
    ): Promise<void>;
    appendBattleFingerprints(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; records: Array<{ tick: number; fp: string; paused: boolean }> },
    ): Promise<{ appended: number }>;
    getBattleFingerprintsRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; fromTick: number; toTick: number },
    ): Promise<{ records: Array<{ tick: number; fp: string; paused: boolean }> }>;
}

interface BattleNetArgs {
    api: LobbyClient;
    session: BattleSessionHandle;
    isHost: boolean;
    lobbyId: string;
    gameId: string;
    playerId: string;
}

function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((v) => stableStringify(v)).join(',')}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
    return `{${entries.join(',')}}`;
}

export type BattleNetPollOnceOptions = {
    /**
     * When true (default false), bypass debug-freeze suppression for heartbeat HTTP and the
     * minimum spacing between heartbeat GETs (diagnostics only).
     */
    forceHttp?: boolean;
};

type BattleHeartbeatApiResult = Awaited<ReturnType<BattleApi['getBattleHeartbeat']>>;

/** Non-host: fields derived from heartbeat that define the server “pause plane” for transition detection. */
type NonHostHbPausePlaneSnap = {
    hostPaused: boolean;
    hostTick: number;
    hostFingerprint: string | null;
    orderBatchAtTick: number | null;
    expectingFromPlayerIds: string[] | null;
};

function battleHeartbeatMinSpacingMs(): number {
    return typeof process !== 'undefined' && process.env.VITEST === 'true' ? 0 : HEARTBEAT_POLL_INTERVAL_MS;
}

const INITIAL_STATE_RETRY_DELAY_MS = 500;
const INITIAL_STATE_MAX_RETRIES = 20;

/**
 * Non-host, ahead of host tail, fingerprints agree: show "waiting for host" only after this many
 * unchanged-tail polls (~2s each).
 */
export const BATTLE_NET_T1_WAITING_POLLS = 3;
/** Same situation: initiate resync after this many polls. */
export const BATTLE_NET_T2_RESYNC_POLLS = 10;

/** Anchor tick stuck (`hostPaused` + host tail equals last proven sync tick): show bottom-centre "waiting for host". */
export const HOST_ANCHOR_WAIT_SHOW_MS = 2000;
/** Same situation: suspected failure — force hard resync. */
export const HOST_ANCHOR_RESYNC_MS = 10_000;

/** Host completed tick minus local engine tick — above this, treat as catching up; lock order UI. */
export const BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD = 10;
export const BATTLE_NET_MAX_DEFERRED_ORDERS = 32;
export const BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS = 5;

function hashOrderId(playerId: string, atTick: number, order: BattleOrder): string {
    const text = `${playerId}|${atTick}|${stableStringify(order)}`;
    let h = 0x811c9dc5 >>> 0;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

export class BattleNet {
    private readonly api: BattleApi;
    private readonly session: BattleSessionHandle;
    private readonly isHost: boolean;
    private readonly lobbyId: string;
    private readonly gameId: string;
    private readonly playerId: string;

    private readonly listeners: { [K in keyof BattleNetEventMap]: Set<Listener<K>> } = {
        'sync-status': new Set(),
        'sync-details': new Set(),
        'host-anchor-wait': new Set(),
        'blocking-host-pause-plane': new Set(),
        'falling-behind': new Set(),
        heartbeat: new Set(),
        'orders-applied': new Set(),
        'host-catchup-wait': new Set(),
    };

    private heartbeatPollActive = false;
    private heartbeatPollTimeout: ReturnType<typeof setTimeout> | null = null;
    private fingerprintFlushTimer: ReturnType<typeof setInterval> | null = null;
    private visibilityHandler: (() => void) | null = null;
    private isPolling = false;
    private isRecovering = false;
    /** Recovery succeeded but UX gate (`BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC=false`) awaits Continue. */
    private recoveryAwaitingUserAck = false;

    private readonly appliedOrderIdHashes = new Set<string>();
    /** Our orders not yet observed in a server `getBattleOrdersRange` response (for UI pipeline). */
    private readonly ourOrdersAwaitingServerRange = new Set<string>();
    /** Our `idHash` values seen in range fetch / replay (server has the row). */
    private readonly serverRangeConfirmedOurOrderHashes = new Set<string>();
    private deferredLocalOrders: Array<{ idHash: string; atTick: number; order: BattleOrder }> = [];
    private pendingFingerprintBatch: Array<{ tick: number; fp: string; paused: boolean }> = [];
    private lastSnapshotTick: number | null = null;
    /** Tick of the snapshot loaded by the most recent latest-checkpoint bootstrap attempt. */
    private lastBootstrapSnapshotTick: number | null = null;
    private lastOrderFetchSince = 0;
    /** Seen count from heartbeat.ordersRecordCount; detects new rows at same atTick as existing orders. */
    private lastSeenOrdersRecordCount = 0;
    private readonly recoveryAttemptTimesByReason = new Map<string, number[]>();
    private currentSyncStatus: BattleNetSyncTerminalStatus = 'waiting_for_host';
    private currentSyncDetails: string | null = null;
    private latestHeartbeatHostTick = 0;
    /** Latest heartbeat parallel order batch (`orderBatchAtTick` / `pausedAtTick` when paused); not last-completed. */
    private latestHeartbeatPausedAtTick: number | null = null;
    /** Epoch ms when `latestHeartbeatHostTick` was last refreshed (poll or append response). */
    private latestHeartbeatObservedAtMs: number | null = null;
    /** Non-host: heartbeat polls still waiting on deferred POST while paused. */
    private hostCatchupHeartbeatStreak = 0;
    /** Non-host: server `hostTick|hostFingerprint` seen on the previous poll (ahead-of-host streak). */
    private lastPollServerTailKey: string | null = null;
    /** Non-host: consecutive polls where we're ahead, agree through host tick, and tail unchanged. */
    private aheadWithUnchangedServerTailStreak = 0;
    /** Non-host: last `hostTick|hostFingerprint` when fingerprint was non-null (material identity for optimistic playahead). */
    private lastHeartbeatMaterialKey: string | null = null;
    /** Non-host: previous poll's `hostTick|hostFingerprint` differed from the prior stored key. */
    private lastPollHeartbeatMaterialChanged = false;
    /**
     * Non-host: last authoritative host completed tick proved aligned (`engineTick===hostTail` fingerprint match or
     * successful appendBattleOrder acceptance). Used to detect "host paused on same tail" stall after optimistic play.
     */
    private previouslySyncedAtTick: number | null = null;
    /** Non-host: wall-clock start when {@link shouldTrackHostAnchorWallWait} stays true across polls. */
    private hostAnchorWaitStartedAtMs: number | null = null;
    /** Dedup repeated `requestResync` kicks while stall condition remains true across polls before recovery arms. */
    private hostAnchorResyncEmittedForCurrentStall = false;
    /** Non-host: heartbeat pause plane after the previous poll (for {@link reconcileNonHostPausePlaneTransition}). */
    private lastNonHostHbPausePlane: NonHostHbPausePlaneSnap | null = null;

    /**
     * Dedupes opt-in lobby_log lines when deferred orders cannot flush (`atTick > hostTick + 1`).
     */
    private deferredFlushBlockedLogKey: string | null = null;

    /** Wall time of the last battle heartbeat HTTP request start (after min-spacing wait). */
    private lastBattleHeartbeatHttpStartedAtMs = 0;
    /** Serializes heartbeat GETs so poll + recovery cannot interleave sub-500ms requests. */
    private battleHeartbeatHttpChain: Promise<unknown> = Promise.resolve();

    constructor(args: BattleNetArgs) {
        this.api = args.api as unknown as BattleApi;
        this.session = args.session;
        this.isHost = args.isHost;
        this.lobbyId = args.lobbyId;
        this.gameId = args.gameId;
        this.playerId = args.playerId;
    }

    start(): void {
        if (this.heartbeatPollActive) {
            console.warn('[BattleNet] start() ignored — heartbeat poll already active', {
                lobbyId: this.lobbyId,
                gameId: this.gameId,
                playerId: this.playerId,
                isHost: this.isHost,
            });
            return;
        }
        this.heartbeatPollActive = true;
        console.info('[BattleNet] start() — heartbeat poll loop', {
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
            isHost: this.isHost,
        });
        this.hostCatchupHeartbeatStreak = 0;
        this.lastPollServerTailKey = null;
        this.aheadWithUnchangedServerTailStreak = 0;
        if (!this.isHost) {
            this.lastNonHostHbPausePlane = null;
        }

        const scheduleNextPoll = (): void => {
            if (!this.heartbeatPollActive) {
                return;
            }
            void this.pollOnce().finally(() => {
                if (!this.heartbeatPollActive) {
                    return;
                }
                const foregroundMs = this.needsActiveHeartbeatPolling()
                    ? HEARTBEAT_POLL_INTERVAL_MS
                    : HEARTBEAT_POLL_IDLE_MS;
                const delay =
                    typeof document !== 'undefined' && document.visibilityState === 'hidden'
                        ? HEARTBEAT_POLL_INTERVAL_HIDDEN_MS
                        : foregroundMs;
                this.heartbeatPollTimeout = setTimeout(() => {
                    this.heartbeatPollTimeout = null;
                    scheduleNextPoll();
                }, delay);
            });
        };
        scheduleNextPoll();

        this.visibilityHandler = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                void this.pollOnce();
            }
        };
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.visibilityHandler);
        }

        if (this.isHost) {
            this.fingerprintFlushTimer = setInterval(() => {
                void this.flushFingerprints();
            }, 1000);
        }
    }

    stop(): void {
        console.info('[BattleNet] stop() — tearing down heartbeat poll', {
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
            isHost: this.isHost,
            hadActivePoll: this.heartbeatPollActive,
        });
        this.heartbeatPollActive = false;
        if (this.heartbeatPollTimeout != null) {
            clearTimeout(this.heartbeatPollTimeout);
            this.heartbeatPollTimeout = null;
        }
        if (this.fingerprintFlushTimer != null) {
            clearInterval(this.fingerprintFlushTimer);
            this.fingerprintFlushTimer = null;
        }
        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        this.visibilityHandler = null;
    }

    on<K extends keyof BattleNetEventMap>(event: K, cb: Listener<K>): Unsub {
        this.listeners[event].add(cb);
        return () => {
            this.listeners[event].delete(cb);
        };
    }

    off<K extends keyof BattleNetEventMap>(event: K, cb: Listener<K>): void {
        this.listeners[event].delete(cb);
    }

    /**
     * Local player order sync pipeline (optimistic submit vs server `orders.jsonl`).
     * - `queued`: rows waiting to POST (deferred until host tick allows).
     * - `sending`: POST accepted path / in flight, not yet seen back in a range fetch for this client.
     */
    getOrderSyncSummary(): { queued: number; sending: number } {
        const deferredIds = new Set(this.deferredLocalOrders.map((r) => r.idHash));
        let sending = 0;
        for (const h of this.ourOrdersAwaitingServerRange) {
            if (!deferredIds.has(h) && !this.serverRangeConfirmedOurOrderHashes.has(h)) {
                sending += 1;
            }
        }
        return { queued: this.deferredLocalOrders.length, sending };
    }

    async submitOrder(order: BattleOrder, atTick: number): Promise<void> {
        if (this.isRecovering) {
            const whyImmediateSubmitSkipped =
                'submitOrder did not reach appendBattleOrder: desync recovery is active';
            console.warn('[BattleNet] immediate submit skipped', {
                why: whyImmediateSubmitSkipped,
                lobbyId: this.lobbyId,
                gameId: this.gameId,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
            });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'submitOrder early exit: skipped while desync recovery is active',
                context: {
                    whyImmediateSubmitSkipped,
                    isHost: this.isHost,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick: this.session.getEngineTick(),
                    localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
                },
            });
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'submitOrder skipped: recovery active (no immediate POST)',
                context: { why: whyImmediateSubmitSkipped, unitId: order.unitId, abilityId: order.abilityId },
            });
            return;
        }
        if (this.recoveryAwaitingUserAck) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder skipped until user acknowledges post-resync continue',
                context: { abilityId: order.abilityId, unitId: order.unitId },
            });
            return;
        }
        const idHash = hashOrderId(this.playerId, atTick, order);
        const localEngineTick = this.session.getEngineTick();
        const localLatestFingerprint = this.session.getLatestFingerprint();
        const localLatestFingerprintTick = localLatestFingerprint?.tick ?? null;
        const effectiveHostTickCandidate =
            this.isHost && localLatestFingerprintTick != null
                ? Math.max(this.latestHeartbeatHostTick, localLatestFingerprintTick)
                : null;
        if (!this.appliedOrderIdHashes.has(idHash)) {
            this.appliedOrderIdHashes.add(idHash);
            this.session.applyRemoteOrders([{ atTick, order }]);
            this.emit('orders-applied', { count: 1, source: 'submit' });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'optimistic local order applied before server confirmation',
                context: {
                    idHash,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    order,
                    isHost: this.isHost,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick,
                    localLatestFingerprintTick,
                    effectiveHostTickCandidate,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
                },
            });
        }
        this.ourOrdersAwaitingServerRange.add(idHash);

        // Defer only when more than one tick ahead of the host's last completed tick.
        // Orders for `hostTick + 1` (same as current `orderBatchAtTick` when paused) must POST while paused.
        const isPausedForOrderSync = this.session.isPausedForOrderSync();
        const orderBatchHeartbeat = this.latestHeartbeatPausedAtTick;
        const heartbeatHostTick = this.latestHeartbeatHostTick;
        const pausedAtGate = orderBatchHeartbeat != null && atTick <= orderBatchHeartbeat;
        const hostSlackGate = atTick <= heartbeatHostTick + 2;
        const allowImmediatePostForCurrentPauseBatch =
            !this.isHost &&
            isPausedForOrderSync &&
            // Heartbeats can lag while both peers are paused; allow hostTick+2 slack for POST.
            (pausedAtGate || hostSlackGate);
        if (!this.isHost && atTick > heartbeatHostTick + 1 && !allowImmediatePostForCurrentPauseBatch) {
            const tailPlusOne = heartbeatHostTick + 1;
            let whyImmediateSubmitSkipped: string;
            if (!isPausedForOrderSync) {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} > hostTick+1 (${tailPlusOne}) and engine not paused for order sync — POST slack only applies while paused waiting for parallel orders`;
            } else if (orderBatchHeartbeat === null) {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} > hostTick+2 (${heartbeatHostTick + 2}); paused locally but heartbeat has no orderBatch/pausedAtTick (hostTick+2 slack exhausted)`;
            } else {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} outside immediate-post windows: need atTick<=${orderBatchHeartbeat} (order batch) or atTick<=${heartbeatHostTick + 2} (hostTick+2)`;
            }
            this.deferLocalOrder(idHash, atTick, order);
            if (isPausedForOrderSync) {
                this.setSyncStatus(
                    'waiting_for_host',
                    'Waiting for host (optimistic playahead). Your order is queued until the host tick catches up.',
                );
            }
            this.emitHostCatchupWaitState();
            console.info('[BattleNet] immediate submit skipped — order queued deferred', {
                why: whyImmediateSubmitSkipped,
                lobbyId: this.lobbyId,
                gameId: this.gameId,
                idHash,
                atTick,
                heartbeatHostTick,
                heartbeatPausedAtTick: orderBatchHeartbeat,
                isPausedForOrderSync,
                pausedAtGate,
                hostSlackGate,
                queuedDeferredAfter: this.deferredLocalOrders.length,
            });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder early exit: deferred before POST because order tick is ahead of host',
                context: {
                    whyImmediateSubmitSkipped,
                    isHost: false,
                    idHash,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    atTick,
                    lastSeenHeartbeatHostTick: heartbeatHostTick,
                    maxImmediatePostTick: heartbeatHostTick + 1,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick,
                    localLatestFingerprintTick,
                    latestHeartbeatPausedAtTick: orderBatchHeartbeat,
                    isPausedForOrderSync,
                    pausedAtGate,
                    hostSlackGate,
                    queuedDeferredAfter: this.deferredLocalOrders.length,
                },
            });
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder deferred until host tick catches up',
                context: {
                    isHost: false,
                    whyImmediateSubmitSkipped,
                    lastSeenHeartbeatHostTick: heartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    queuedAfter: this.deferredLocalOrders.length,
                },
            });
            return;
        }

        await this.persistOrder(order, atTick, idHash, true);
    }

    async saveInitialState(): Promise<void> {
        if (!this.isHost) {
            return;
        }
        const existing = await this.getBattleInitialState();
        if (existing != null) {
            return;
        }
        const payload = this.session.getPayloadForPersistedInitialStateOrNull();
        if (payload == null) {
            return;
        }
        await this.api.saveBattleInitialState(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            state: payload.state,
            initialFingerprint: payload.initialFingerprint,
        });
    }

    async getBattleInitialState(): Promise<{ state: SerializedGameState; initialFingerprint: string } | null> {
        return this.api.getBattleInitialState(this.lobbyId, this.gameId, this.playerId);
    }

    requestResync(_reason: string): void {
        if (this.isRecovering) {
            return;
        }
        void this.runDesyncRecovery(_reason);
    }

    queueFingerprint(tick: number, fp: string, paused: boolean): void {
        if (!this.isHost) {
            return;
        }
        this.pendingFingerprintBatch.push({ tick, fp, paused });
    }

    async saveSnapshotOnPause(tick: number, state: SerializedGameState): Promise<void> {
        if (!this.isHost || this.lastSnapshotTick === tick) {
            return;
        }
        // Must match {@link GameEngine.getRuntimeFingerprintHex} / tick-complete host flush — not the
        // layout digest from {@link GameEngine.computeInitialFingerprint}, or snapshot POST can win
        // {@link BattleStorage::appendFingerprints} first-writer and strand the wrong tail hash on disk.
        const checkpointFp = this.session.getRuntimeFingerprintHex();
        const checkpointPayload =
            typeof checkpointFp === 'string' && checkpointFp !== ''
                ? {
                      checkpointFingerprint: checkpointFp,
                      checkpointFingerprintPaused: this.session.getFingerprintTailPaused(),
                  }
                : {};
        await this.api.saveBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            tick,
            state,
            ...checkpointPayload,
        });
        const engineNow = this.session.getEngineTick();
        if (engineNow > tick) {
            // `saveBattleSnapshot` can be slow; if the host already unpaused and simulated past
            // this checkpoint, do not append a stale `{tick}` line after higher ticks on disk.
            this.lastSnapshotTick = tick;
            return;
        }
        // When `checkpointFingerprint` is sent, the server appends `fingerprints.jsonl` in the same request.
        this.lastSnapshotTick = tick;
    }

    /**
     * Host-only: after local parallel batch orders are satisfied, persist pending → applied on the server.
     * Retries up to three times; returns false on total failure (`requestResync` already armed).
     */
    async mergeAppliedOrdersForBatch(batchAtTick: number): Promise<boolean> {
        if (!this.isHost || !Number.isFinite(batchAtTick) || batchAtTick < 1) {
            return true;
        }
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const res = await this.api.mergeBattleAppliedOrders(this.lobbyId, this.gameId, {
                    playerId: this.playerId,
                    batchAtTick,
                });
                if (res.success) {
                    return true;
                }
            } catch (_) {
                /* retry */
            }
            await this.sleep(200 * (attempt + 1));
        }
        logToLobbyLog({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: batchAtTick,
            severity: 'error',
            gameId: this.gameId,
            message: 'mergeBattleAppliedOrders failed after retries; requesting resync',
            context: { batchAtTick, attempts: maxAttempts },
        });
        this.requestResync('merge-applied-failed');
        return false;
    }

    /** Clears the post-recovery "Continue" UX gate (see {@link BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC}). */
    acknowledgeRecoveryContinue(): void {
        if (!this.recoveryAwaitingUserAck) {
            return;
        }
        // Clear gate before setSyncStatus so heartbeat's `synced` guard does not no-op the transition.
        this.recoveryAwaitingUserAck = false;
        this.setSyncStatus('synced', null);
    }

    /**
     * Debug: serializes the live engine via {@link BattleSessionHandle.getSerializedSnapshot}, logs it to
     * `lobby_log.jsonl` at **critical** severity, then (host only) POSTs the same payload through
     * `saveBattleSnapshot` — not React/debug-buffered lobby state.
     */
    async debugLogLocalStateAndSubmitSnapshot(): Promise<void> {
        const state = this.session.getSerializedSnapshot();
        const tick = state.gameTick;
        const checkpointFp = this.session.getRuntimeFingerprintHex();
        const checkpointPayload =
            typeof checkpointFp === 'string' && checkpointFp !== ''
                ? {
                      checkpointFingerprint: checkpointFp,
                      checkpointFingerprintPaused: this.session.getFingerprintTailPaused(),
                  }
                : {};

        logToLobbyLog({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick,
            severity: 'critical',
            gameId: this.gameId,
            gamePhase: 'battle',
            message: 'debug: local serialized game state',
            context: {
                isHost: this.isHost,
                serializedGameState: state,
            },
        });

        if (!this.isHost) {
            return;
        }

        await this.api.saveBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            tick,
            state,
            ...checkpointPayload,
        });
        const engineNow = this.session.getEngineTick();
        if (engineNow > tick) {
            this.lastSnapshotTick = tick;
            return;
        }
        this.lastSnapshotTick = tick;
    }

    async pollOnce(opts?: BattleNetPollOnceOptions): Promise<void> {
        if (this.isPolling || this.isRecovering) {
            return;
        }
        this.isPolling = true;
        try {
            if (!opts?.forceHttp && this.session.isDebugSimulationFrozen()) {
                return;
            }

            const hbRaw = await this.getBattleHeartbeatThrottled({
                gameTick: this.session.getEngineTick(),
                bypassThrottle: opts?.forceHttp === true,
            });
            const ordersRecordCountRaw = hbRaw.ordersRecordCount;
            const ordersRecordCount =
                typeof ordersRecordCountRaw === 'number' && !Number.isNaN(ordersRecordCountRaw)
                    ? ordersRecordCountRaw
                    : null;
            const orderBatchFromRaw = hbRaw.orderBatchAtTick ?? hbRaw.pausedAtTick;
            const orderBatchAtTick =
                typeof orderBatchFromRaw === 'number' && !Number.isNaN(orderBatchFromRaw) ? orderBatchFromRaw : null;
            const hb: BattleNetEventMap['heartbeat'] = {
                hostTick: hbRaw.hostTick ?? 0,
                hostFingerprint: hbRaw.hostFingerprint ?? null,
                hostPaused: hbRaw.hostPaused === true,
                ordersTipTick: hbRaw.ordersTipTick ?? -1,
                ordersRecordCount,
                orderBatchAtTick,
                pausedAtTick: hbRaw.pausedAtTick ?? null,
                expectingFromPlayerIds: hbRaw.expectingFromPlayerIds ?? null,
                initialFingerprint: hbRaw.initialFingerprint ?? null,
                heartbeatSeq: typeof hbRaw.heartbeatSeq === 'number' && !Number.isNaN(hbRaw.heartbeatSeq) ? hbRaw.heartbeatSeq : 0,
                pendingOrders:
                    hbRaw.pendingOrders ??
                    ((hbRaw as { minimalPendingOrders?: unknown }).minimalPendingOrders as
                        | Array<Record<string, unknown>>
                        | undefined),
                appliedOrdersAtTick: hbRaw.appliedOrdersAtTick,
                latestServerGameTick:
                    hbRaw.latestServerGameTick ?? (typeof hbRaw.hostTick === 'number' ? hbRaw.hostTick : null),
                latestServerGameHash:
                    hbRaw.latestServerGameHash ??
                    (typeof hbRaw.hostFingerprint === 'string' ? hbRaw.hostFingerprint : null),
                gameTick: hbRaw.gameTick ?? null,
                gameHash: hbRaw.gameHash ?? null,
                fingerprintTailTick:
                    typeof hbRaw.fingerprintTailTick === 'number' && !Number.isNaN(hbRaw.fingerprintTailTick)
                        ? hbRaw.fingerprintTailTick
                        : null,
                fingerprintTailFingerprint:
                    typeof hbRaw.fingerprintTailFingerprint === 'string' ? hbRaw.fingerprintTailFingerprint : null,
            };
            let heartbeatMaterialChanged = false;
            if (!this.isHost) {
                const matKey =
                    hb.hostFingerprint != null && hb.hostFingerprint !== ''
                        ? `${hb.hostTick}|${hb.hostFingerprint}`
                        : null;
                const prevMat = this.lastHeartbeatMaterialKey;
                heartbeatMaterialChanged = matKey != null && prevMat != null && matKey !== prevMat;
                if (matKey != null) {
                    this.lastHeartbeatMaterialKey = matKey;
                }
                if (heartbeatMaterialChanged) {
                    this.resetNonHostAheadStreak();
                }
                this.lastPollHeartbeatMaterialChanged = heartbeatMaterialChanged;
            } else {
                this.lastPollHeartbeatMaterialChanged = false;
            }
            this.updateLastSeenHeartbeat(hb.hostTick);
            this.latestHeartbeatPausedAtTick = orderBatchAtTick;
            this.emit('heartbeat', hb);

            if (!this.isHost) {
                await this.flushDeferredOrdersUpTo(hb.hostTick);
                const paused = this.session.isPausedForOrderSync();
                const blocking = this.deferredLocalOrders.length > 0;
                if (blocking && paused) {
                    this.hostCatchupHeartbeatStreak += 1;
                } else {
                    this.hostCatchupHeartbeatStreak = 0;
                }
                this.emitHostCatchupWaitState();
                await this.maybeForceFlushDeferredOrder(hb.hostTick);
            }

            const revisionFetch =
                ordersRecordCount !== null && ordersRecordCount > this.lastSeenOrdersRecordCount;
            const legacyFetch = ordersRecordCount === null && hb.ordersTipTick >= this.lastOrderFetchSince;

            // Pull newly published peer orders:
            // - Legacy: gate on ordersTipTick (max atTick); cheap but misses a second append at same atTick.
            // - Preferred: heartbeat.ordersRecordCount (row count); any append triggers refetch-from-zero + idHash dedupe.
            if (revisionFetch || legacyFetch) {
                await this.fetchAndApplyNewOrders(hb.ordersTipTick, {
                    rescanOrdersFromTickZero: revisionFetch,
                    serverOrderRecordCount: ordersRecordCount,
                });
            }

            const engineTick = this.session.getEngineTick();

            if (!this.isHost) {
                const behind = hb.hostTick - engineTick;
                if (behind > BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD) {
                    this.emit('falling-behind', { active: true, ticksBehind: behind });
                } else {
                    this.emit('falling-behind', { active: false, ticksBehind: Math.max(0, behind) });
                }
                this.reconcileNonHostBehindHostTail(engineTick, hb, heartbeatMaterialChanged);
            }

            if (!this.isHost && engineTick < hb.hostTick) {
                this.resetNonHostAheadStreak();
            }

            if (engineTick === hb.hostTick) {
                this.reconcileFingerprintsEqualHostTick(engineTick, hb);
            } else if (!this.isHost && engineTick > hb.hostTick) {
                this.reconcileNonHostAheadOfHostTail(engineTick, hb);
            }

            if (!this.isHost) {
                if (engineTick < hb.hostTick) {
                    this.clearHostAnchorWaitState();
                    this.emitBlockingHostPausePlane(false);
                } else {
                    this.refreshHostAnchorWaitAndBlocking(engineTick, hb);
                }
                const prevPlane = this.lastNonHostHbPausePlane;
                if (prevPlane !== null && this.pausePlaneKeyFromSnap(prevPlane) !== this.pausePlaneKeyFromHb(hb)) {
                    this.reconcileNonHostPausePlaneTransition(prevPlane, hb, engineTick);
                }
                this.lastNonHostHbPausePlane = this.snapshotHbPausePlane(hb);
            }

            if (this.isHost) {
                await this.flushFingerprints();
            }
            this.publishSyncDebugBridge(hb);
        } finally {
            this.isPolling = false;
        }
    }

    private async fetchAndApplyNewOrders(
        untilTick: number,
        opts?: { rescanOrdersFromTickZero?: boolean; serverOrderRecordCount?: number | null },
    ): Promise<void> {
        const rescan = opts?.rescanOrdersFromTickZero === true;
        if (!rescan && untilTick < this.lastOrderFetchSince) {
            return;
        }
        const sinceTick = rescan ? 0 : this.lastOrderFetchSince;
        const range = await this.api.getBattleOrdersRange(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            sinceTick: sinceTick > 0 ? sinceTick : undefined,
            untilTick: untilTick >= 0 ? untilTick : undefined,
        });
        const toApply: Array<{ atTick: number; order: BattleOrder }> = [];
        for (const rec of range.orders) {
            if (rec.playerId === this.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(rec.idHash);
                this.ourOrdersAwaitingServerRange.delete(rec.idHash);
            }
            if (this.appliedOrderIdHashes.has(rec.idHash)) {
                continue;
            }
            this.appliedOrderIdHashes.add(rec.idHash);
            toApply.push({ atTick: rec.atTick, order: rec.order });
        }
        if (toApply.length > 0) {
            this.session.applyRemoteOrders(toApply);
            this.emit('orders-applied', { count: toApply.length, source: 'poll' });
        }
        const srvCount = opts?.serverOrderRecordCount;
        if (srvCount != null) {
            this.lastSeenOrdersRecordCount = srvCount;
        }
        if (!rescan && untilTick >= 0) {
            // In legacy heartbeat mode (no ordersRecordCount), a poll can race an append:
            // heartbeat advertises tip tick N, range fetch returns empty, and the order row
            // is written moments later at the same tick N. Only advance the cursor to what we
            // actually observed so late-arriving rows at the same tick are still discoverable.
            const maxObservedAtTick = range.orders.reduce<number | null>((maxTick, rec) => {
                if (typeof rec.atTick !== 'number') {
                    return maxTick;
                }
                return maxTick == null ? rec.atTick : Math.max(maxTick, rec.atTick);
            }, null);
            if (maxObservedAtTick != null) {
                this.lastOrderFetchSince = maxObservedAtTick + 1;
            }
        } else if (rescan && untilTick >= 0) {
            const maxObservedAtTick = range.orders.reduce<number | null>((maxTick, rec) => {
                if (typeof rec.atTick !== 'number') {
                    return maxTick;
                }
                return maxTick == null ? rec.atTick : Math.max(maxTick, rec.atTick);
            }, null);
            if (maxObservedAtTick != null) {
                this.lastOrderFetchSince = maxObservedAtTick + 1;
            }
        }
    }

    private deferLocalOrder(idHash: string, atTick: number, order: BattleOrder): void {
        if (this.deferredLocalOrders.some((item) => item.idHash === idHash)) {
            return;
        }
        if (this.deferredLocalOrders.length >= BATTLE_NET_MAX_DEFERRED_ORDERS) {
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'deferred order queue cap exceeded; requesting resync',
                context: { cap: BATTLE_NET_MAX_DEFERRED_ORDERS },
            });
            this.requestResync('deferred-queue-overflow');
            return;
        }
        this.deferredLocalOrders.push({ idHash, atTick, order });
    }

    private async persistOrder(
        order: BattleOrder,
        atTick: number,
        idHash: string,
        allowDeferralOnHostLag: boolean,
    ): Promise<void> {
        let res: {
            accepted: boolean;
            idHash: string;
            rejectedReason?: string;
            maxAllowedTick?: number;
            minAllowedTick?: number;
            hostTick?: number;
            hostFingerprint?: string | null;
        };
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: 'info',
            gameId: this.gameId,
            message: 'appendBattleOrder POST attempt',
            context: {
                idHash,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
                allowDeferralOnHostLag,
                isHost: this.isHost,
                lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                localEngineTick: this.session.getEngineTick(),
                localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                isPausedForOrderSync: this.session.isPausedForOrderSync(),
                queuedDeferredBeforePost: this.deferredLocalOrders.length,
            },
        });
        try {
            res = await this.api.appendBattleOrder(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                atTick,
                order,
                idHash,
            });
        } catch (_error) {
            const err = _error instanceof Error ? _error.message : String(_error);
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder POST failed before response',
                context: {
                    idHash,
                    atTick,
                    unitId: order.unitId,
                    abilityId: order.abilityId,
                    error: err,
                    isHost: this.isHost,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick: this.session.getEngineTick(),
                    localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeEnqueue: this.deferredLocalOrders.length,
                },
            });
            this.deferLocalOrder(idHash, atTick, order);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder network error; deferred for retry',
                context: { abilityId: order.abilityId, unitId: order.unitId },
            });
            this.emitHostCatchupWaitState();
            return;
        }
        this.updateHeartbeatFromAppendResponse(res);
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: res.accepted ? 'info' : 'warn',
            gameId: this.gameId,
            message: res.accepted ? 'appendBattleOrder POST response accepted' : 'appendBattleOrder POST response not accepted',
            context: {
                idHash,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
                accepted: res.accepted,
                rejectedReason: res.rejectedReason ?? null,
                maxAllowedTick: res.maxAllowedTick ?? null,
                minAllowedTick: res.minAllowedTick ?? null,
                serverHostTickAtAppend: res.hostTick ?? null,
                serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                queuedDeferredAtResponse: this.deferredLocalOrders.length,
            },
        });
        this.appliedOrderIdHashes.add(res.idHash || idHash);
        if (res.accepted) {
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            if (!this.isHost) {
                const t =
                    typeof res.hostTick === 'number' && !Number.isNaN(res.hostTick)
                        ? res.hostTick
                        : this.latestHeartbeatHostTick;
                this.previouslySyncedAtTick = t;
                this.hostAnchorWaitStartedAtMs = null;
                this.hostAnchorResyncEmittedForCurrentStall = false;
            }
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'log',
                gameId: this.gameId,
                message: 'appendBattleOrder accepted',
                context: {
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            return;
        }
        if (allowDeferralOnHostLag && res.rejectedReason === 'tick_ahead_of_host') {
            this.deferLocalOrder(idHash, atTick, order);
            if (this.session.isPausedForOrderSync()) {
                this.setSyncStatus(
                    'waiting_for_host',
                    'Waiting for host (optimistic playahead). Your order is queued until the host tick catches up.',
                );
            }
            this.emitHostCatchupWaitState();
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder rejected tick_ahead_of_host; deferred client POST',
                context: {
                    maxAllowedTick: res.maxAllowedTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            return;
        }
        if (!allowDeferralOnHostLag && res.rejectedReason === 'tick_ahead_of_host') {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'forced deferred POST retry still ahead of host; keeping order queued',
                context: {
                    idHash,
                    maxAllowedTick: res.maxAllowedTick ?? null,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            this.emitHostCatchupWaitState();
            return;
        }
        if (res.rejectedReason === 'tick_in_past') {
            this.emitRejectedOrderSyncDetail(res.rejectedReason);
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder rejected tick_in_past; requesting resync',
                context: {
                    minAllowedTick: res.minAllowedTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            this.requestResync('tick-in-past');
            return;
        }
        if (res.rejectedReason === 'not_unit_owner' || res.rejectedReason === 'unknown_unit') {
            this.emitRejectedOrderSyncDetail(res.rejectedReason);
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: `appendBattleOrder rejected ${res.rejectedReason}; requesting resync`,
                context: { unitId: order.unitId },
            });
            this.requestResync(res.rejectedReason === 'not_unit_owner' ? 'not-unit-owner' : 'unknown-unit');
            return;
        }
        // Duplicate/other non-ahead responses mean the server already has this order or
        // cannot use it; keep local optimistic state transient and drop the deferred row.
        this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: 'warn',
            gameId: this.gameId,
            message:
                'appendBattleOrder HTTP 200 but not appended — no rejectedReason (usually duplicate idHash on server)',
            context: {
                idHash,
                abilityId: order.abilityId,
                unitId: order.unitId,
                lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                serverHostTickAtAppend: res.hostTick ?? null,
                serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                note: 'If server duplicate is a false positive, investigate 32-bit idHash collisions.',
            },
        });
    }

    private updateLastSeenHeartbeat(hostTick: number): void {
        this.latestHeartbeatHostTick = hostTick;
        this.latestHeartbeatObservedAtMs = Date.now();
    }

    private updateHeartbeatFromAppendResponse(res: { hostTick?: number; hostFingerprint?: string | null }): void {
        if (typeof res.hostTick !== 'number' || Number.isNaN(res.hostTick)) {
            return;
        }
        if (res.hostTick < this.latestHeartbeatHostTick) {
            return;
        }
        this.updateLastSeenHeartbeat(res.hostTick);
    }

    private getLastHeartbeatAgeMs(): number | null {
        if (this.latestHeartbeatObservedAtMs == null) {
            return null;
        }
        return Math.max(0, Date.now() - this.latestHeartbeatObservedAtMs);
    }

    private async flushDeferredOrdersUpTo(hostTick: number): Promise<void> {
        if (this.deferredLocalOrders.length === 0) {
            return;
        }
        this.deferredLocalOrders.sort((a, b) => a.atTick - b.atTick);
        const pending = [...this.deferredLocalOrders];
        const maxEligibleAtTick = hostTick + 1;
        const engineTick = this.session.getEngineTick();
        let flushAttempted = 0;
        for (const item of pending) {
            if (item.atTick > maxEligibleAtTick) {
                const blockedCount = pending.length - flushAttempted;
                const head = item;
                if (flushAttempted === 0) {
                    const whyFlushSkipped =
                        `no deferred POST this poll: earliest queued row is atTick=${head.atTick} but heartbeat hostTick=${hostTick} only allows POST for atTick<=${maxEligibleAtTick}`;
                    console.info('[BattleNet] flushDeferredOrdersUpTo skipped posting (all rows blocked)', {
                        why: whyFlushSkipped,
                        lobbyId: this.lobbyId,
                        gameId: this.gameId,
                        heartbeatHostTick: hostTick,
                        maxEligibleAtTick,
                        queuedCount: pending.length,
                        deferredHeadIdHash: head.idHash,
                    });
                    logToLobbyLogBattleSync({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo skipped: deferred atTick ahead of heartbeat host tail',
                        context: {
                            whyFlushSkipped,
                            heartbeatHostTick: hostTick,
                            maxEligibleAtTick,
                            queuedDeferredCount: pending.length,
                            earliestDeferredAtTick: head.atTick,
                            earliestDeferredIdHash: head.idHash,
                        },
                    });
                    logToLobbyLog({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo skipped (host tail)',
                        context: {
                            why: whyFlushSkipped,
                            heartbeatHostTick: hostTick,
                            queuedCount: pending.length,
                        },
                    });
                } else if (blockedCount > 0) {
                    const whyFlushSkippedPartial =
                        `posted ${flushAttempted} deferred row(s); ${blockedCount} still blocked (need atTick<=${maxEligibleAtTick}, next atTick=${head.atTick})`;
                    console.info('[BattleNet] flushDeferredOrdersUpTo left rows blocked after partial flush', {
                        why: whyFlushSkippedPartial,
                        lobbyId: this.lobbyId,
                        gameId: this.gameId,
                        heartbeatHostTick: hostTick,
                        maxEligibleAtTick,
                        postedCount: flushAttempted,
                        blockedCount,
                        nextBlockedAtTick: head.atTick,
                    });
                    logToLobbyLogBattleSync({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo partial: later deferred rows still ahead of host tail',
                        context: {
                            whyFlushSkipped: whyFlushSkippedPartial,
                            heartbeatHostTick: hostTick,
                            maxEligibleAtTick,
                            postedDeferredCount: flushAttempted,
                            stillQueuedCount: blockedCount,
                            nextBlockedAtTick: head.atTick,
                            nextBlockedIdHash: head.idHash,
                        },
                    });
                    logToLobbyLog({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo partial flush; rows remain queued',
                        context: {
                            why: whyFlushSkippedPartial,
                            heartbeatHostTick: hostTick,
                            postedCount: flushAttempted,
                            blockedCount,
                        },
                    });
                }
                break;
            }
            await this.persistOrder(item.order, item.atTick, item.idHash, true);
            flushAttempted++;
        }
    }

    private async maybeForceFlushDeferredOrder(hostTick: number): Promise<void> {
        if (this.deferredLocalOrders.length === 0) {
            return;
        }
        if (!this.session.isPausedForOrderSync()) {
            const why =
                `Watchdog POST force-retry arms only during an engine parallel order batch (${this.engineOrderSyncPauseSummary()}). ` +
                'Here the sim is not in that pause—deferred HTTP row(s) remain until hostTick catches up (flushDeferredOrdersUpTo) or a new waitingForOrders batch starts.';
            this.logDeferredWatchdogBranch(
                'skipped_not_paused_for_order_sync',
                hostTick,
                {},
                why,
            );
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: this.session.getEngineTick(),
                severity: 'info',
                gameId: this.gameId,
                message: 'deferred order watchdog skipped — engine not paused for order sync while deferred POST queued',
                context: {
                    why,
                    branch: 'skipped_not_paused_for_order_sync',
                    hostTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    queuedDeferredCount: this.deferredLocalOrders.length,
                    latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                    stuckHeartbeats: this.hostCatchupHeartbeatStreak,
                    localEngineTick: this.session.getEngineTick(),
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    waitingForOrdersBatch: this.session.getWaitingForOrdersBatch(),
                    engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
                },
            });
            return;
        }
        if (this.hostCatchupHeartbeatStreak < BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS) {
            this.logDeferredWatchdogBranch(
                'skipped_streak_below_threshold',
                hostTick,
                {
                    threshold: BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
                },
                `${this.engineOrderSyncPauseSummary()}. Deferred HTTP POST still queued; only ${this.hostCatchupHeartbeatStreak} heartbeat poll(s) saw paused+blocking (need ${BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS}) before forcing POST retry.`,
            );
            return;
        }
        if (this.hostCatchupHeartbeatStreak % BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS !== 0) {
            this.logDeferredWatchdogBranch(
                'skipped_not_on_retry_multiple',
                hostTick,
                {
                    threshold: BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
                },
                `${this.engineOrderSyncPauseSummary()}. Deferred HTTP queued; force-retry aligns to every ${BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS} consecutive paused+blocking heartbeat polls.`,
            );
            return;
        }
        const oldestDeferred = [...this.deferredLocalOrders].sort((a, b) => a.atTick - b.atTick)[0];
        if (oldestDeferred == null) {
            this.logDeferredWatchdogBranch(
                'skipped_oldest_missing',
                hostTick,
                {},
                'Deferred queue reported non-empty but sorted head was missing (unexpected).',
            );
            return;
        }
        this.logDeferredWatchdogBranch(
            'forcing_retry',
            hostTick,
            {
                idHash: oldestDeferred.idHash,
                atTick: oldestDeferred.atTick,
            },
            `${this.engineOrderSyncPauseSummary()}. Stalled heartbeat threshold met — re-POST oldest deferred HTTP row.`,
        );
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: oldestDeferred.atTick,
            severity: 'warn',
            gameId: this.gameId,
            message: 'deferred order watchdog forcing POST retry while paused',
            context: {
                idHash: oldestDeferred.idHash,
                atTick: oldestDeferred.atTick,
                hostTick,
                stuckHeartbeats: this.hostCatchupHeartbeatStreak,
                queuedDeferredCount: this.deferredLocalOrders.length,
                latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                waitingForOrdersBatch: this.session.getWaitingForOrdersBatch(),
                engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
            },
        });
        await this.persistOrder(oldestDeferred.order, oldestDeferred.atTick, oldestDeferred.idHash, false);
    }

    /**
     * Human-readable snapshot of {@link GameEngine.waitingForOrders} for sync logs.
     * That pause is raised when the tick loop finds player units that can act but still need orders
     * for the parallel batch (see `GameEngine.collectParallelWaiters` / `commitDeferredOrderPauseAfterCompletedTick`).
     */
    private engineOrderSyncPauseSummary(): string {
        const b = this.session.getWaitingForOrdersBatch();
        if (!b) {
            return 'engine waitingForOrders=null (sim not in parallel order batch)';
        }
        const ids = b.waiters.map((w) => w.unitId).join(',');
        return `engine waitingForOrders atTick=${b.atTick}, ${b.waiters.length} waiter(s) [${ids}]`;
    }

    private logDeferredWatchdogBranch(
        branch: string,
        hostTick: number,
        extraContext: Record<string, unknown>,
        why: string,
    ): void {
        const context = {
            branch,
            why,
            hostTick,
            stuckHeartbeats: this.hostCatchupHeartbeatStreak,
            queuedDeferredCount: this.deferredLocalOrders.length,
            latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
            isPausedForOrderSync: this.session.isPausedForOrderSync(),
            waitingForOrdersBatch: this.session.getWaitingForOrdersBatch(),
            engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
            ...extraContext,
        };
        console.info('[BattleNet] deferred watchdog', context);
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: this.session.getEngineTick(),
            severity: 'info',
            gameId: this.gameId,
            message: 'deferred order watchdog branch',
            context,
        });
    }

    private emitHostCatchupWaitState(): void {
        const targetTick =
            this.deferredLocalOrders.length > 0
                ? this.deferredLocalOrders.reduce((maxTick, row) => Math.max(maxTick, row.atTick), -1)
                : null;
        const blocking = this.deferredLocalOrders.length > 0;
        this.emit('host-catchup-wait', {
            blocking,
            stuckHeartbeats: this.hostCatchupHeartbeatStreak,
            hostTick: this.latestHeartbeatHostTick,
            targetTick,
            queuedCount: this.deferredLocalOrders.length,
        });
    }

    private resetLocalOptimisticOrdersOnResync(): void {
        // Preserve deferred orders across recovery so required local turns are not dropped.
        this.appliedOrderIdHashes.clear();
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.hostCatchupHeartbeatStreak = 0;
        this.resetNonHostAheadStreak();
        this.lastOrderFetchSince = 0;
        this.lastSeenOrdersRecordCount = 0;
        this.deferredFlushBlockedLogKey = null;
        this.previouslySyncedAtTick = null;
        this.lastHeartbeatMaterialKey = null;
        this.lastPollHeartbeatMaterialChanged = false;
        this.lastNonHostHbPausePlane = null;
        this.clearHostAnchorWaitState();
        this.emitBlockingHostPausePlane(false);
        this.emitHostCatchupWaitState();
    }

    private resetNonHostAheadStreak(): void {
        this.lastPollServerTailKey = null;
        this.aheadWithUnchangedServerTailStreak = 0;
    }

    private clearHostAnchorWaitState(): void {
        this.hostAnchorWaitStartedAtMs = null;
        this.hostAnchorResyncEmittedForCurrentStall = false;
        this.emit('host-anchor-wait', { phase: 'idle', elapsedMs: 0 });
    }

    private notePreviouslySyncedAnchorTick(hostAlignedTick: number): void {
        this.previouslySyncedAtTick = hostAlignedTick;
        this.clearHostAnchorWaitState();
    }

    private computeBlockingNonHostPausePlane(engineTick: number, hb: BattleNetEventMap['heartbeat']): boolean {
        const localBatch = this.session.getWaitingForOrdersBatch();
        if (localBatch == null) {
            return false;
        }
        const hostParallel = hb.orderBatchAtTick;
        if (hostParallel != null && hostParallel !== localBatch.atTick) {
            return true;
        }
        return engineTick > hb.hostTick;
    }

    private emitBlockingHostPausePlane(blocking: boolean): void {
        this.emit('blocking-host-pause-plane', { blocking });
    }

    private shouldTrackHostAnchorWallWait(engineTick: number, hb: BattleNetEventMap['heartbeat']): boolean {
        const anchor = this.previouslySyncedAtTick;
        if (anchor == null) {
            return false;
        }
        if (hb.hostTick !== anchor) {
            return false;
        }
        if (!hb.hostPaused) {
            return false;
        }
        const hasOutboundOrderAckWait =
            this.deferredLocalOrders.length > 0 || this.ourOrdersAwaitingServerRange.size > 0;
        const optimisticParallelAhead =
            this.session.isPausedForOrderSync() && engineTick > hb.hostTick;
        return hasOutboundOrderAckWait || optimisticParallelAhead;
    }

    /** Non-host-only: heartbeat-driven wall clock for “host stalled on anchor tick”; bottom-centre UX + hard resync. */
    private refreshHostAnchorWaitAndBlocking(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const blockingPause = this.computeBlockingNonHostPausePlane(engineTick, hb);
        this.emitBlockingHostPausePlane(blockingPause);

        if (!this.shouldTrackHostAnchorWallWait(engineTick, hb)) {
            if (this.hostAnchorWaitStartedAtMs != null) {
                this.clearHostAnchorWaitState();
            }
            return;
        }

        const now = Date.now();
        if (this.hostAnchorWaitStartedAtMs == null) {
            this.hostAnchorWaitStartedAtMs = now;
        }
        const elapsedMs = Math.max(0, now - this.hostAnchorWaitStartedAtMs);

        let phase: BattleNetEventMap['host-anchor-wait']['phase'] = 'idle';
        if (elapsedMs >= HOST_ANCHOR_WAIT_SHOW_MS) {
            phase = 'waiting_ui';
        }

        if (elapsedMs >= HOST_ANCHOR_RESYNC_MS && !this.hostAnchorResyncEmittedForCurrentStall && !this.isRecovering) {
            this.hostAnchorResyncEmittedForCurrentStall = true;
            phase = 'forcing_resync';
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.gameId,
                message:
                    'host anchor wait exceeded threshold; suspected stall after optimistic pause — forcing resync',
                context: {
                    elapsedMs,
                    previouslySyncedAtTick: this.previouslySyncedAtTick,
                    hostPaused: hb.hostPaused,
                    hostTick: hb.hostTick,
                    orderBatchAtTick: hb.orderBatchAtTick,
                    engineTick,
                    deferredCount: this.deferredLocalOrders.length,
                    outboundAckWaitCount: this.ourOrdersAwaitingServerRange.size,
                    waitingBatch: this.session.getWaitingForOrdersBatch(),
                },
            });
            this.requestResync('host-stuck-after-submit');
        }

        this.emit('host-anchor-wait', { phase, elapsedMs });
    }

    /**
     * Host-only: fingerprint hash matches storage tail but `paused` disagrees. While paused for parallel
     * orders, the last-completed tick row on disk often stays `paused: false` (row written at tick end
     * before the deferred pause bit, or first-writer canonical vs a later ring push) even though the
     * runtime ring correctly records `paused: true`. Heartbeat `hostPaused` reads that row — do not
     * leave the host stuck in `waiting_for_host` when batch alignment proves we are in that plane.
     */
    private hostPauseFlagMismatchBenignForParallelBatch(
        engineTick: number,
        hb: BattleNetEventMap['heartbeat'],
        local: { tick: number; fp: string; paused: boolean },
    ): boolean {
        if (!this.isHost) {
            return false;
        }
        if (local.paused === hb.hostPaused) {
            return false;
        }
        if (!(local.paused && !hb.hostPaused)) {
            return false;
        }
        if (!this.session.isPausedForOrderSync()) {
            return false;
        }
        const batch = this.session.getWaitingForOrdersBatch();
        if (batch == null || !Number.isFinite(batch.atTick) || batch.atTick <= 0) {
            return false;
        }
        if (engineTick + 1 !== batch.atTick) {
            return false;
        }
        const hbBatch = hb.orderBatchAtTick;
        if (hbBatch != null && !Number.isNaN(hbBatch) && hbBatch !== batch.atTick) {
            return false;
        }
        return true;
    }

    /** Host + non-host — last completed matches server tail. */
    private reconcileFingerprintsEqualHostTick(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const local = this.session.getLatestFingerprint();
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused === hb.hostPaused
        ) {
            if (!this.isHost) {
                this.resetNonHostAheadStreak();
                this.notePreviouslySyncedAnchorTick(hb.hostTick);
            }
            this.setSyncStatus('synced');
            return;
        }
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused !== hb.hostPaused &&
            this.hostPauseFlagMismatchBenignForParallelBatch(engineTick, hb, local)
        ) {
            this.setSyncStatus('synced');
            return;
        }
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused !== hb.hostPaused &&
            !this.isHost
        ) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'equal-tick fingerprint match but paused flag mismatched vs heartbeat hostPaused',
                context: {
                    engineTick,
                    localPausedRing: local.paused,
                    hostPaused: hb.hostPaused,
                    hostFingerprintTail: hb.hostFingerprint?.slice(0, 12),
                },
            });
            this.requestResync('pause-flag-equal-tick-mismatch');
            return;
        }
        if (
            this.isHost &&
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            (local.fp !== hb.hostFingerprint || local.paused !== hb.hostPaused)
        ) {
            // Non-host path calls `requestResync` on mismatch; host must not leave a stale `synced` from an
            // earlier poll when storage tail (fingerprints.jsonl / snapshot synchash) disagrees with the engine.
            this.setSyncStatus(
                'waiting_for_host',
                local.fp !== hb.hostFingerprint
                    ? 'Host runtime fingerprint does not match server storage tail.'
                    : 'Host pause flag does not match storage tail vs heartbeat.',
            );
            return;
        }
        if (!this.isHost && hb.hostFingerprint != null) {
            this.requestResync('hash-mismatch');
        }
    }

    /**
     * Non-host: local engine tick is behind heartbeat `hostTick` but heartbeat material (`hostTick` + fp) changed —
     * authoritative storage moved past our sim (host progressed; we did not keep pace or forked).
     */
    private reconcileNonHostBehindHostTail(
        engineTick: number,
        hb: BattleNetEventMap['heartbeat'],
        materialChanged: boolean,
    ): void {
        if (this.isHost || !materialChanged) {
            return;
        }
        if (engineTick >= hb.hostTick) {
            return;
        }
        if (hb.hostFingerprint == null || hb.hostFingerprint === '') {
            return;
        }
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: engineTick,
            severity: 'warn',
            gameId: this.gameId,
            message: 'non-host behind heartbeat tail after hostTick/hostFingerprint material change — resync',
            context: {
                engineTick,
                hostTick: hb.hostTick,
                hostFingerprintHead: hb.hostFingerprint.slice(0, 12),
            },
        });
        this.requestResync('behind-host-heartbeat-moved');
    }

    /** Non-host: local sim past server completed tail — align finger/pause tails; never claim `synced` when optimistically paused ahead. */
    private reconcileNonHostAheadOfHostTail(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const localOrderPause = this.session.isPausedForOrderSync();

        if (hb.hostPaused && engineTick > hb.hostTick && !localOrderPause) {
            this.resetNonHostAheadStreak();
            const exp = hb.expectingFromPlayerIds;
            const parallelClear = Array.isArray(exp) && exp.length === 0;
            const hostFp = hb.hostFingerprint;
            if (parallelClear && hostFp != null && hostFp !== '') {
                const agreeRow = this.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];
                if (agreeRow != null && agreeRow.fp === hostFp) {
                    this.setSyncStatus(
                        'waiting_for_host',
                        'Local sim ahead while server tail is clamped; fingerprints agree at completed tick (checkpoint may trail).',
                    );
                    return;
                }
            }
            const parallelOpen = Array.isArray(exp) && exp.length > 0;
            const detail = parallelOpen
                ? 'Server heartbeat still lists parallel order waiters while local sim advanced (optimistic play-ahead); waiting for pause plane to update.'
                : 'Server heartbeat still paused below local progress (optimistic play-ahead); waiting for storage to catch up.';
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: engineTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'non-host ahead of clamped server tail — waiting_for_host (not resync)',
                context: {
                    engineTick,
                    hostTick: hb.hostTick,
                    hostPaused: hb.hostPaused,
                    orderBatchAtTick: hb.orderBatchAtTick,
                    expectingFromPlayerIds: exp,
                },
            });
            this.setSyncStatus('waiting_for_host', detail);
            return;
        }

        const hostTailFp = hb.hostFingerprint;
        if (hostTailFp == null) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const localRow = this.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];

        if (localRow != null && localRow.fp !== hostTailFp) {
            this.resetNonHostAheadStreak();
            this.requestResync('hash-mismatch');
            return;
        }

        if (localRow != null && localRow.paused !== hb.hostPaused) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'ahead-of-host: fingerprint-row paused disagrees with heartbeat hostPaused at host tail',
                context: {
                    engineTick,
                    hostTick: hb.hostTick,
                    localPausedTail: localRow.paused,
                    hostPausedHb: hb.hostPaused,
                    fpTail: hostTailFp.slice(0, 12),
                },
            });
            this.resetNonHostAheadStreak();
            this.requestResync('pause-flag-tail-mismatch');
            return;
        }

        if (localRow == null) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const localFpAtTail = localRow.fp;

        if (localOrderPause) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const tailKey = `${hb.hostTick}|${hostTailFp}`;
        const unchanged =
            this.lastPollServerTailKey !== null &&
            this.lastPollServerTailKey === tailKey &&
            localFpAtTail === hostTailFp;

        if (unchanged) {
            this.aheadWithUnchangedServerTailStreak += 1;
        } else {
            this.aheadWithUnchangedServerTailStreak = 0;
        }
        this.lastPollServerTailKey = tailKey;

        if (this.aheadWithUnchangedServerTailStreak >= BATTLE_NET_T2_RESYNC_POLLS) {
            this.resetNonHostAheadStreak();
            this.requestResync('ahead-of-host');
            return;
        }

        if (this.aheadWithUnchangedServerTailStreak >= BATTLE_NET_T1_WAITING_POLLS) {
            this.setSyncStatus('waiting_for_host');
            return;
        }

        this.setSyncStatus('synced');
    }

    private snapshotHbPausePlane(hb: BattleNetEventMap['heartbeat']): NonHostHbPausePlaneSnap {
        const batchRaw = hb.orderBatchAtTick ?? hb.pausedAtTick;
        const batch = typeof batchRaw === 'number' && !Number.isNaN(batchRaw) ? batchRaw : null;
        const exp = hb.expectingFromPlayerIds;
        return {
            hostPaused: hb.hostPaused,
            hostTick: hb.hostTick,
            hostFingerprint: hb.hostFingerprint,
            orderBatchAtTick: batch,
            expectingFromPlayerIds: Array.isArray(exp) ? [...exp].sort() : null,
        };
    }

    private pausePlaneKeyFromSnap(s: NonHostHbPausePlaneSnap): string {
        const expPart = Array.isArray(s.expectingFromPlayerIds) ? s.expectingFromPlayerIds.join(',') : '';
        const batch = s.orderBatchAtTick ?? '';
        return `${s.hostPaused ? 1 : 0}|${s.hostTick}|${s.hostFingerprint ?? ''}|${batch}|${expPart}`;
    }

    private pausePlaneKeyFromHb(hb: BattleNetEventMap['heartbeat']): string {
        return this.pausePlaneKeyFromSnap(this.snapshotHbPausePlane(hb));
    }

    /**
     * Non-host: when heartbeat pause plane changes vs the previous poll, verify fingerprints at the new
     * completed tail; resync only on mismatch (see `docs/game-sync-plan.md` optimistic play-ahead).
     */
    private reconcileNonHostPausePlaneTransition(
        prev: NonHostHbPausePlaneSnap,
        curr: BattleNetEventMap['heartbeat'],
        engineTick: number,
    ): void {
        if (this.isHost || this.isRecovering) {
            return;
        }
        if (this.pausePlaneKeyFromSnap(prev) === this.pausePlaneKeyFromHb(curr)) {
            return;
        }

        const hostFp = curr.hostFingerprint;
        if (hostFp == null || hostFp === '') {
            return;
        }

        const localRow = this.session.getFingerprintRange(curr.hostTick, curr.hostTick)[0];
        if (localRow != null && localRow.fp !== hostFp) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'pause plane changed — fingerprint mismatch at server completed tail',
                context: {
                    engineTick,
                    hostTick: curr.hostTick,
                    hostFingerprintHead: hostFp.slice(0, 12),
                    prevPausePlane: this.pausePlaneKeyFromSnap(prev),
                    nextPausePlane: this.pausePlaneKeyFromHb(curr),
                },
            });
            this.resetNonHostAheadStreak();
            this.requestResync('pause-plane-transition-hash-mismatch');
            return;
        }

        if (localRow != null && localRow.fp === hostFp) {
            if (!curr.hostPaused && engineTick >= curr.hostTick) {
                this.resetNonHostAheadStreak();
                this.notePreviouslySyncedAnchorTick(curr.hostTick);
                this.setSyncStatus('synced');
                return;
            }
            this.setSyncStatus(
                'waiting_for_host',
                'Heartbeat pause plane updated; still waiting on server-completed tail.',
            );
            return;
        }
    }

    private async flushFingerprints(): Promise<void> {
        if (!this.isHost || this.pendingFingerprintBatch.length === 0) {
            return;
        }
        const batch = this.pendingFingerprintBatch;
        this.pendingFingerprintBatch = [];
        try {
            await this.api.appendBattleFingerprints(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                records: batch,
            });
        } catch (_error) {
            this.pendingFingerprintBatch = batch.concat(this.pendingFingerprintBatch);
        }
    }

    private noteRecoveryAttempt(reason: string): boolean {
        const now = Date.now();
        const cutoff = now - 30_000;
        const attempts = this.recoveryAttemptTimesByReason.get(reason) ?? [];
        const freshAttempts = attempts.filter((t) => t >= cutoff);
        freshAttempts.push(now);
        this.recoveryAttemptTimesByReason.set(reason, freshAttempts);
        return freshAttempts.length > 3;
    }

    private async replayOrdersSince(sinceTick: number): Promise<void> {
        const orderRange = await this.api.getBattleOrdersRange(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            sinceTick,
        });
        const toApply: Array<{ atTick: number; order: BattleOrder }> = [];
        for (const record of orderRange.orders) {
            if (record.playerId === this.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(record.idHash);
                this.ourOrdersAwaitingServerRange.delete(record.idHash);
            }
            if (this.appliedOrderIdHashes.has(record.idHash)) {
                continue;
            }
            this.appliedOrderIdHashes.add(record.idHash);
            toApply.push({ atTick: record.atTick, order: record.order });
        }
        if (toApply.length > 0) {
            this.session.applyRemoteOrders(toApply);
            this.emit('orders-applied', { count: toApply.length, source: 'poll' });
        }
    }

    private isFingerprintAlignedWithHeartbeat(heartbeat: {
        hostTick: number | null;
        hostFingerprint: string | null;
        hostPaused?: boolean | null;
    }): boolean {
        const local = this.session.getLatestFingerprint();
        if (!local || heartbeat.hostTick == null || heartbeat.hostFingerprint == null) {
            return false;
        }
        if (local.tick !== heartbeat.hostTick || local.fp !== heartbeat.hostFingerprint) {
            return false;
        }
        if (heartbeat.hostPaused != null && local.paused !== heartbeat.hostPaused) {
            return false;
        }
        return true;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Ensures at least {@link HEARTBEAT_POLL_INTERVAL_MS} between battle heartbeat GETs across
     * the poll loop, recovery, and alignment helpers (serialized so concurrent callers cannot bypass).
     */
    private getBattleHeartbeatThrottled(opts?: {
        gameTick?: number;
        bypassThrottle?: boolean;
    }): Promise<BattleHeartbeatApiResult> {
        const pending = this.battleHeartbeatHttpChain.then(async (): Promise<BattleHeartbeatApiResult> => {
            if (!opts?.bypassThrottle) {
                const gap = battleHeartbeatMinSpacingMs();
                if (gap > 0) {
                    const now = Date.now();
                    if (this.lastBattleHeartbeatHttpStartedAtMs > 0) {
                        const elapsed = now - this.lastBattleHeartbeatHttpStartedAtMs;
                        if (elapsed < gap) {
                            await this.sleep(gap - elapsed);
                        }
                    }
                    this.lastBattleHeartbeatHttpStartedAtMs = Date.now();
                }
            }
            return this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId, {
                gameTick: opts?.gameTick,
            });
        });
        this.battleHeartbeatHttpChain = pending.then(
            () => undefined,
            () => undefined,
        );
        return pending;
    }

    private setSyncDetails(message: string | null): void {
        this.currentSyncDetails = message;
        this.emit('sync-details', message);
    }

    private setSyncStatus(status: BattleNetSyncTerminalStatus, details: string | null = null): void {
        // After desync recovery we require explicit Continue (`synced_pending_ack`). Heartbeat
        // fingerprint reconcile must not emit `synced` / `waiting_for_host` over that gate — it
        // used to leave `recoveryAwaitingUserAck` true while the UI showed `synced` (no banner).
        if (
            this.recoveryAwaitingUserAck &&
            status !== 'synced_pending_ack' &&
            status !== 'resyncing' &&
            status !== 'failed'
        ) {
            return;
        }

        this.recoveryAwaitingUserAck = status === 'synced_pending_ack';
        this.currentSyncStatus = status;
        this.emit('sync-status', status);
        this.setSyncDetails(details);
    }

    private finalizeRecoveryOutcome(synced: boolean, reason: string): void {
        if (!synced) {
            this.setSyncStatus('failed');
            return;
        }
        if (BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC || reason === 'initial-state-mismatch') {
            this.setSyncStatus('synced');
            return;
        }
        this.setSyncStatus(
            'synced_pending_ack',
            `Battle state was resynced. Press Continue when you are ready to resume. (${reason})`,
        );
    }

    private summarizeOrderRejectReason(reason: string | undefined): string {
        if (reason == null || reason === '') {
            return '';
        }
        switch (reason) {
            case 'tick_in_past':
                return ': order tick already passed on the server';
            case 'tick_ahead_of_host':
                return ': order tick was ahead of host';
            case 'not_unit_owner':
                return ': you do not control this unit';
            case 'unknown_unit':
                return ': unit not found for this battle snapshot';
            default:
                return `: ${reason}`;
        }
    }

    private emitRejectedOrderSyncDetail(rejectedReason?: string): void {
        const tail = this.summarizeOrderRejectReason(rejectedReason);
        const msg = `Desynced: orders rejected by server${tail}. Recovering…`;
        this.currentSyncDetails = msg;
        this.emit('sync-details', msg);
    }

    private needsActiveHeartbeatPolling(): boolean {
        if (this.isRecovering) {
            return true;
        }
        if (this.session.isPausedForOrderSync()) {
            return true;
        }
        if (this.deferredLocalOrders.length > 0) {
            return true;
        }
        if (this.isHost) {
            return false;
        }
        return this.session.isEngineSimulationRunning();
    }

    private getSnapshotFingerprint(state: SerializedGameState, envelopeSynchash?: string | null): string | null {
        if (typeof envelopeSynchash === 'string' && envelopeSynchash !== '') {
            return envelopeSynchash;
        }
        return typeof state.initialFingerprint === 'string' && state.initialFingerprint !== ''
            ? state.initialFingerprint
            : null;
    }

    /**
     * Loads the newest persisted battle snapshot (`GET snapshot` without atTick),
     * replays queued orders from that checkpoint tick onward, returns true iff a snapshot existed.
     * Used when joining/reloading mid-battle so the client resumes at host parity instead of frame 1.
     */
    async tryBootstrapFromLatestCheckpoint(): Promise<boolean> {
        const snapshot = await this.api.getBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
        });
        if (snapshot == null) {
            this.lastBootstrapSnapshotTick = null;
            return false;
        }
        this.lastBootstrapSnapshotTick = snapshot.tick;
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.session.loadFromSnapshot(snapshot.state, {
            checkpointRuntimeFingerprintHex: snapshot.synchash,
        });
        await this.replayOrdersSince(snapshot.tick);
        this.lastOrderFetchSince = 0;
        this.lastSeenOrdersRecordCount = 0;
        return true;
    }

    /**
     * Fresh client init fingerprint disagrees with server's canonical initial fingerprint —
     * catch up via the latest persisted checkpoint before falling back to initial snapshot + orders.
     */
    async recoverFromLobbyInitialFingerprintMismatch(): Promise<boolean> {
        return this.recoverFromInitialStateMismatchWithRetry();
    }

    private async applyAuthoritativeStateAndCheckAlignment(
        state: SerializedGameState,
        replaySinceTick: number,
        checkpointRuntimeFingerprintHex?: string | null,
    ): Promise<boolean> {
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.session.loadFromSnapshot(state, { checkpointRuntimeFingerprintHex });
        await this.replayOrdersSince(replaySinceTick);
        const heartbeat = await this.getBattleHeartbeatThrottled();
        return this.isFingerprintAlignedWithHeartbeat(heartbeat);
    }

    /** Host-persisted battle start + full order log replay (tick 0 baseline). */
    private async performInitialStateReplay(): Promise<boolean> {
        const initial = await this.api.getBattleInitialState(this.lobbyId, this.gameId, this.playerId);
        if (initial == null) {
            return false;
        }
        return this.applyAuthoritativeStateAndCheckAlignment(initial.state, 0, null);
    }

    /**
     * Initial-state mismatch healing:
     * 1) prefer latest server snapshot (authoritative),
     * 2) when absent, poll initial-state with a short retry loop.
     */
    private async recoverFromInitialStateMismatchWithRetry(): Promise<boolean> {
        const local = this.session.getLatestFingerprint();
        const localTick = this.session.getEngineTick();

        const latestSnapshot = await this.api.getBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
        });
        if (latestSnapshot != null) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: localTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'initial-state mismatch healed from latest snapshot',
                context: {
                    localTick,
                    localHash: local?.fp ?? null,
                    initialTick: latestSnapshot.tick,
                    initialHash: this.getSnapshotFingerprint(latestSnapshot.state, latestSnapshot.synchash),
                },
            });
            return this.applyAuthoritativeStateAndCheckAlignment(
                latestSnapshot.state,
                latestSnapshot.tick,
                latestSnapshot.synchash,
            );
        }

        for (let attempt = 1; attempt <= INITIAL_STATE_MAX_RETRIES; attempt++) {
            const initial = await this.api.getBattleInitialState(this.lobbyId, this.gameId, this.playerId);
            if (initial != null) {
                logToLobbyLogBattleSync({
                    lobbyClient: this.api as unknown as LobbyClient,
                    lobbyId: this.lobbyId,
                    playerId: this.playerId,
                    tick: localTick,
                    severity: 'warn',
                    gameId: this.gameId,
                    message: 'initial-state mismatch healed from initial_state.json after snapshot missing',
                    context: {
                        localTick,
                        localHash: local?.fp ?? null,
                        initialTick:
                            typeof initial.state.gameTick === 'number'
                                ? initial.state.gameTick
                                : null,
                        initialHash: initial.initialFingerprint,
                        retryAttempt: attempt,
                    },
                });
                this.setSyncDetails(null);
                return this.applyAuthoritativeStateAndCheckAlignment(initial.state, 0, null);
            }

            this.setSyncDetails('Failed to fetch initial state... retrying');
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: localTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'initial-state mismatch retry: initial state missing',
                context: {
                    localTick,
                    localHash: local?.fp ?? null,
                    retryAttempt: attempt,
                    retryInMs: INITIAL_STATE_RETRY_DELAY_MS,
                },
            });
            await this.sleep(INITIAL_STATE_RETRY_DELAY_MS);
        }

        return false;
    }

    private async runDesyncRecovery(reason: string): Promise<void> {
        if (this.noteRecoveryAttempt(reason)) {
            console.error(`[BattleNet] recovery escalated: too many "${reason}" recoveries in 30s`);
            this.setSyncStatus('failed');
            return;
        }

        this.isRecovering = true;
        this.setSyncStatus('resyncing');
        this.resetLocalOptimisticOrdersOnResync();
        try {
            if (reason === 'initial-state-mismatch') {
                const initialSuccess = await this.recoverFromInitialStateMismatchWithRetry();
                this.finalizeRecoveryOutcome(initialSuccess, reason);
                return;
            }

            const localTick = this.session.getEngineTick();
            const fromTick = Math.max(0, localTick - 600);
            const serverRange = await this.api.getBattleFingerprintsRange(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                fromTick,
                toTick: localTick,
            });
            const localRange = this.session.getFingerprintRange(fromTick, localTick);
            const localByTick = new Map(localRange.map((record) => [record.tick, record.fp]));

            let firstMismatchTick: number | null = null;
            for (const serverRecord of serverRange.records) {
                const localFp = localByTick.get(serverRecord.tick);
                if (localFp == null || localFp !== serverRecord.fp) {
                    firstMismatchTick = serverRecord.tick;
                    break;
                }
            }

            if (firstMismatchTick == null) {
                const localLatest = this.session.getLatestFingerprint();
                const serverLatest =
                    serverRange.records.length > 0 ? serverRange.records[serverRange.records.length - 1] : null;
                if (localLatest != null && serverLatest != null && localLatest.fp !== serverLatest.fp) {
                    firstMismatchTick = Math.max(localLatest.tick, serverLatest.tick);
                } else {
                    firstMismatchTick = localTick;
                }
            }

            let synced = false;
            // Prefer newest authoritative checkpoint first to avoid user-visible replay loops.
            if (await this.tryBootstrapFromLatestCheckpoint()) {
                const heartbeat = await this.getBattleHeartbeatThrottled();
                synced = this.isFingerprintAlignedWithHeartbeat(heartbeat);
            }

            if (!synced) {
                const requestedAtTick = Math.max(0, firstMismatchTick - 1);
                let snapshot = await this.api.getBattleSnapshot(this.lobbyId, this.gameId, {
                    playerId: this.playerId,
                    atTick: requestedAtTick,
                });
                // Disk layout only has pause checkpoints (e.g. snapshots/1.json). atTick=0 selects nothing.
                if (snapshot == null && requestedAtTick === 0) {
                    snapshot = await this.api.getBattleSnapshot(this.lobbyId, this.gameId, {
                        playerId: this.playerId,
                    });
                }
                if (snapshot != null) {
                    this.session.loadFromSnapshot(snapshot.state, {
                        checkpointRuntimeFingerprintHex: snapshot.synchash,
                    });
                    await this.replayOrdersSince(snapshot.tick);
                    const hbLate = await this.getBattleHeartbeatThrottled();
                    synced = this.isFingerprintAlignedWithHeartbeat(hbLate);
                }
                if (!synced) {
                    const beforeInitialReplayTick = this.session.getEngineTick();
                    const beforeInitialReplayFingerprint = this.session.getLatestFingerprint();
                    synced = await this.performInitialStateReplay();
                    const afterInitialReplayTick = this.session.getEngineTick();
                    const afterInitialReplayFingerprint = this.session.getLatestFingerprint();
                    // Safety patch: if we're still not aligned and the last attempt left the client on tick 0,
                    // restore the latest snapshot so the user doesn't appear stuck at the start of the battle.
                    if (!synced && afterInitialReplayTick === 0) {
                        const restoredLatest = await this.tryBootstrapFromLatestCheckpoint();
                        if (restoredLatest) {
                            const hbAfterRestore = await this.getBattleHeartbeatThrottled();
                            synced = this.isFingerprintAlignedWithHeartbeat(hbAfterRestore);
                            logToLobbyLogBattleSync({
                                lobbyClient: this.api as unknown as LobbyClient,
                                lobbyId: this.lobbyId,
                                playerId: this.playerId,
                                tick: beforeInitialReplayTick,
                                severity: 'warn',
                                gameId: this.gameId,
                                message:
                                    'safety patch: restored latest snapshot after initial-state replay failed alignment (client stuck at tick 0)',
                                context: {
                                    localTickBeforeInitialReplay: beforeInitialReplayTick,
                                    localHashBeforeInitialReplay: beforeInitialReplayFingerprint?.fp ?? null,
                                    initialStateTick: afterInitialReplayTick,
                                    initialStateHash: afterInitialReplayFingerprint?.fp ?? null,
                                    restoredSnapshotTick: this.lastBootstrapSnapshotTick,
                                    alignedAfterRestore: synced,
                                    reason,
                                },
                            });
                        }
                    }
                }
            }

            if (synced) {
                this.finalizeRecoveryOutcome(true, reason);
            } else {
                console.error(`[BattleNet] recovery failed for "${reason}"`);
                this.finalizeRecoveryOutcome(false, reason);
            }
        } catch (error) {
            console.error(`[BattleNet] recovery error for "${reason}"`, error);
            this.setSyncStatus('failed');
        } finally {
            this.isRecovering = false;
        }
    }

    private emit<K extends keyof BattleNetEventMap>(event: K, payload: BattleNetEventMap[K]): void {
        for (const cb of this.listeners[event]) {
            cb(payload);
        }
    }

    private publishSyncDebugBridge(hb: BattleNetEventMap['heartbeat']): void {
        if (typeof window === 'undefined') {
            return;
        }
        const bridge = window as unknown as {
            __minionBattlesSyncDebug?: Record<string, unknown>;
        };
        const hostTailTick =
            typeof hb.hostTick === 'number' && !Number.isNaN(hb.hostTick) ? hb.hostTick : null;
        const localAtServerTail =
            hostTailTick != null ? this.session.getFingerprintRange(hostTailTick, hostTailTick)[0] ?? null : null;

        bridge.__minionBattlesSyncDebug = {
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
            isHost: this.isHost,
            lastHeartbeat: hb,
            lastPollAt: Date.now(),
            deferredOrderCount: this.deferredLocalOrders.length,
            orderSyncSummary: this.getOrderSyncSummary(),
            stuckHeartbeats: this.hostCatchupHeartbeatStreak,
            lastOrderFetchSince: this.lastOrderFetchSince,
            lastSeenOrdersRecordCount: this.lastSeenOrdersRecordCount,
            engineTick: this.session.getEngineTick(),
            clientTick: this.session.getEngineTick(),
            localLatestFingerprint: this.session.getLatestFingerprint(),
            /** Ring row at `heartbeat.hostTick` — compare to `hostFingerprint` when engine tick is ahead of tail. */
            localFingerprintAtServerTail: localAtServerTail,
            syncStatus: this.currentSyncStatus,
            syncDetails: this.currentSyncDetails,
            heartbeatMaterialKey: this.lastHeartbeatMaterialKey,
            heartbeatMaterialChanged: this.lastPollHeartbeatMaterialChanged,
        };
    }
}

export type BattleNetFactoryArgs = Omit<BattleNetArgs, 'isHost'>;

export class HostBattleNet extends BattleNet {
    constructor(args: BattleNetFactoryArgs) {
        super({ ...args, isHost: true });
    }
}

export class ClientBattleNet extends BattleNet {
    constructor(args: BattleNetFactoryArgs) {
        super({ ...args, isHost: false });
    }
}

export function createBattleNet(args: BattleNetFactoryArgs & { isHost: boolean }): BattleNet {
    return args.isHost ? new HostBattleNet(args) : new ClientBattleNet(args);
}
