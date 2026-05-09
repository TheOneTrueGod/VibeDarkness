import type { LobbyClient } from '../../../LobbyClient';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../lobbyLog';
import type { BattleOrder, SerializedGameState } from './types';

export interface BattleSessionHandle {
    getEngineTick(): number;
    getLatestFingerprint(): { tick: number; fp: string } | null;
    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string }>;
    getInitialFingerprint(): string;
    getSerializedSnapshot(): SerializedGameState;
    getSerializedInitialState(): SerializedGameState;
    /** Tick-0 baseline for one-time `initial_state.json`; null when restored from checkpoint-only (no in-memory tick 0 blob). */
    getPayloadForPersistedInitialStateOrNull(): {
        state: SerializedGameState;
        initialFingerprint: string;
    } | null;
    startEngine(): void;
    loadFromSnapshot(state: SerializedGameState): void;
    applyRemoteOrders(orders: Array<{ atTick: number; order: BattleOrder }>): void;
    /** True while paused for multiplayer order submission (serialized waiters). */
    isPausedForOrderSync(): boolean;
}

type BattleNetEventMap = {
    'sync-status': 'synced' | 'waiting_for_host' | 'resyncing' | 'failed';
    /** Optional human-readable sync detail shown in Battle UI while recovering. */
    'sync-details': string | null;
    /** Non-host: local simulation is behind the server's completed tick. */
    'falling-behind': { active: boolean; ticksBehind: number };
    heartbeat: {
        hostTick: number;
        hostFingerprint: string | null;
        ordersTipTick: number;
        ordersRecordCount: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq: number;
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
    ): Promise<{ tick: number; state: SerializedGameState } | null>;
    getBattleHeartbeat(
        lobbyId: string,
        gameId: string,
        playerId: string,
    ): Promise<{
        hostTick: number | null;
        hostFingerprint: string | null;
        ordersTipTick: number | null;
        ordersRecordCount?: number | null;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
        heartbeatSeq?: number | null;
    }>;
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
        body: { playerId: string; tick: number; state: SerializedGameState; checkpointFingerprint?: string },
    ): Promise<void>;
    appendBattleFingerprints(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; records: Array<{ tick: number; fp: string }> },
    ): Promise<{ appended: number }>;
    getBattleFingerprintsRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; fromTick: number; toTick: number },
    ): Promise<{ records: Array<{ tick: number; fp: string }> }>;
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

/** Minimum idle time after a poll finishes before the next heartbeat request (foreground tab). */
const HEARTBEAT_POLL_INTERVAL_MS = 2000;
/** Background tabs: slower polling; `visibilitychange` still forces an immediate poll. */
const HEARTBEAT_POLL_INTERVAL_HIDDEN_MS = 10_000;
const INITIAL_STATE_RETRY_DELAY_MS = 500;
const INITIAL_STATE_MAX_RETRIES = 20;

/**
 * Non-host, ahead of host tail, fingerprints agree: show "waiting for host" only after this many
 * unchanged-tail polls (~2s each).
 */
export const BATTLE_NET_T1_WAITING_POLLS = 3;
/** Same situation: initiate resync after this many polls. */
export const BATTLE_NET_T2_RESYNC_POLLS = 10;

/** Host completed tick minus local engine tick — above this, treat as catching up; lock order UI. */
export const BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD = 10;
export const BATTLE_NET_MAX_DEFERRED_ORDERS = 32;

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

    private readonly appliedOrderIdHashes = new Set<string>();
    /** Our orders not yet observed in a server `getBattleOrdersRange` response (for UI pipeline). */
    private readonly ourOrdersAwaitingServerRange = new Set<string>();
    /** Our `idHash` values seen in range fetch / replay (server has the row). */
    private readonly serverRangeConfirmedOurOrderHashes = new Set<string>();
    private deferredLocalOrders: Array<{ idHash: string; atTick: number; order: BattleOrder }> = [];
    private pendingFingerprintBatch: Array<{ tick: number; fp: string }> = [];
    private lastSnapshotTick: number | null = null;
    /** Tick of the snapshot loaded by the most recent latest-checkpoint bootstrap attempt. */
    private lastBootstrapSnapshotTick: number | null = null;
    private lastOrderFetchSince = 0;
    /** Seen count from heartbeat.ordersRecordCount; detects new rows at same atTick as existing orders. */
    private lastSeenOrdersRecordCount = 0;
    private readonly recoveryAttemptTimesByReason = new Map<string, number[]>();
    private latestHeartbeatHostTick = 0;
    /** Non-host: heartbeat polls still waiting on deferred POST while paused. */
    private hostCatchupHeartbeatStreak = 0;
    /** Non-host: server `hostTick|hostFingerprint` seen on the previous poll (ahead-of-host streak). */
    private lastPollServerTailKey: string | null = null;
    /** Non-host: consecutive polls where we're ahead, agree through host tick, and tail unchanged. */
    private aheadWithUnchangedServerTailStreak = 0;
    /**
     * Dedupes opt-in lobby_log lines when deferred orders cannot flush (`atTick > hostTick + 1`).
     */
    private deferredFlushBlockedLogKey: string | null = null;

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
            return;
        }
        this.heartbeatPollActive = true;
        this.hostCatchupHeartbeatStreak = 0;
        this.lastPollServerTailKey = null;
        this.aheadWithUnchangedServerTailStreak = 0;

        const scheduleNextPoll = (): void => {
            if (!this.heartbeatPollActive) {
                return;
            }
            void this.pollOnce().finally(() => {
                if (!this.heartbeatPollActive) {
                    return;
                }
                const delay =
                    typeof document !== 'undefined' && document.visibilityState === 'hidden'
                        ? HEARTBEAT_POLL_INTERVAL_HIDDEN_MS
                        : HEARTBEAT_POLL_INTERVAL_MS;
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
            return;
        }
        const idHash = hashOrderId(this.playerId, atTick, order);
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
                    latestHeartbeatHostTick: this.latestHeartbeatHostTick,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
                },
            });
        }
        this.ourOrdersAwaitingServerRange.add(idHash);

        // Defer only when more than one tick ahead of the host's last completed tick.
        // Orders for `hostTick + 1` must POST while paused for that batch (host cannot
        // raise `hostTick` until all orders exist).
        if (!this.isHost && atTick > this.latestHeartbeatHostTick + 1) {
            this.deferLocalOrder(idHash, atTick, order);
            if (this.session.isPausedForOrderSync()) {
                this.setSyncStatus('waiting_for_host');
            }
            this.emitHostCatchupWaitState();
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
                    latestHeartbeatHostTick: this.latestHeartbeatHostTick,
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

    queueFingerprint(tick: number, fp: string): void {
        if (!this.isHost) {
            return;
        }
        this.pendingFingerprintBatch.push({ tick, fp });
    }

    async saveSnapshotOnPause(tick: number, state: SerializedGameState): Promise<void> {
        if (!this.isHost || this.lastSnapshotTick === tick) {
            return;
        }
        const checkpointFp =
            typeof state.initialFingerprint === 'string' && state.initialFingerprint !== ''
                ? state.initialFingerprint
                : undefined;
        await this.api.saveBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            tick,
            state,
            ...(checkpointFp != null ? { checkpointFingerprint: checkpointFp } : {}),
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

    async pollOnce(): Promise<void> {
        if (this.isPolling || this.isRecovering) {
            return;
        }
        this.isPolling = true;
        try {
            const hbRaw = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
            const ordersRecordCountRaw = hbRaw.ordersRecordCount;
            const ordersRecordCount =
                typeof ordersRecordCountRaw === 'number' && !Number.isNaN(ordersRecordCountRaw)
                    ? ordersRecordCountRaw
                    : null;
            const hb = {
                hostTick: hbRaw.hostTick ?? 0,
                hostFingerprint: hbRaw.hostFingerprint ?? null,
                ordersTipTick: hbRaw.ordersTipTick ?? -1,
                ordersRecordCount,
                pausedAtTick: hbRaw.pausedAtTick ?? null,
                expectingFromPlayerIds: hbRaw.expectingFromPlayerIds ?? null,
                initialFingerprint: hbRaw.initialFingerprint ?? null,
                heartbeatSeq: typeof hbRaw.heartbeatSeq === 'number' && !Number.isNaN(hbRaw.heartbeatSeq) ? hbRaw.heartbeatSeq : 0,
            };
            this.latestHeartbeatHostTick = hb.hostTick;
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
            }

            if (!this.isHost && engineTick < hb.hostTick) {
                this.resetNonHostAheadStreak();
            }

            if (engineTick === hb.hostTick) {
                const local = this.session.getLatestFingerprint();
                if (local?.tick === engineTick && hb.hostFingerprint && local.fp === hb.hostFingerprint) {
                    if (!this.isHost) {
                        this.resetNonHostAheadStreak();
                    }
                    this.setSyncStatus('synced');
                } else if (hb.hostFingerprint != null && !this.isHost) {
                    this.requestResync('hash-mismatch');
                }
            } else if (!this.isHost && engineTick > hb.hostTick) {
                this.handleNonHostAheadOfHostTail(hb);
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
        };
        try {
            res = await this.api.appendBattleOrder(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                atTick,
                order,
                idHash,
            });
        } catch (_error) {
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
        this.appliedOrderIdHashes.add(res.idHash || idHash);
        if (res.accepted) {
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'log',
                gameId: this.gameId,
                message: 'appendBattleOrder accepted',
                context: { abilityId: order.abilityId, unitId: order.unitId },
            });
            return;
        }
        if (allowDeferralOnHostLag && res.rejectedReason === 'tick_ahead_of_host') {
            this.deferLocalOrder(idHash, atTick, order);
            if (this.session.isPausedForOrderSync()) {
                this.setSyncStatus('waiting_for_host');
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
                    latestHeartbeatHostTick: this.latestHeartbeatHostTick,
                },
            });
            return;
        }
        if (res.rejectedReason === 'tick_in_past') {
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
                    latestHeartbeatHostTick: this.latestHeartbeatHostTick,
                },
            });
            this.requestResync('tick-in-past');
            return;
        }
        if (res.rejectedReason === 'not_unit_owner' || res.rejectedReason === 'unknown_unit') {
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
                latestHeartbeatHostTick: this.latestHeartbeatHostTick,
                note: 'If server duplicate is a false positive, investigate 32-bit idHash collisions.',
            },
        });
    }

    private async flushDeferredOrdersUpTo(hostTick: number): Promise<void> {
        if (this.deferredLocalOrders.length === 0) {
            return;
        }
        this.deferredLocalOrders.sort((a, b) => a.atTick - b.atTick);
        const pending = [...this.deferredLocalOrders];
        for (const item of pending) {
            if (item.atTick > hostTick + 1) {
                break;
            }
            await this.persistOrder(item.order, item.atTick, item.idHash, true);
        }
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
        this.deferredLocalOrders = [];
        this.appliedOrderIdHashes.clear();
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.hostCatchupHeartbeatStreak = 0;
        this.resetNonHostAheadStreak();
        this.lastOrderFetchSince = 0;
        this.lastSeenOrdersRecordCount = 0;
        this.deferredFlushBlockedLogKey = null;
        this.emitHostCatchupWaitState();
    }

    private resetNonHostAheadStreak(): void {
        this.lastPollServerTailKey = null;
        this.aheadWithUnchangedServerTailStreak = 0;
    }

    /** Non-host: `engineTick` is past the server-reported completed tick — compare local ring at that tick. */
    private handleNonHostAheadOfHostTail(hb: { hostTick: number; hostFingerprint: string | null }): void {
        if (this.session.isPausedForOrderSync()) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const hostTailFp = hb.hostFingerprint;
        if (hostTailFp == null) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const range = this.session.getFingerprintRange(hb.hostTick, hb.hostTick);
        const localAtHostTick = range[0]?.fp;

        if (localAtHostTick != null && localAtHostTick !== hostTailFp) {
            this.resetNonHostAheadStreak();
            this.requestResync('hash-mismatch');
            return;
        }

        if (localAtHostTick == null) {
            this.resetNonHostAheadStreak();
            this.setSyncStatus('waiting_for_host');
            return;
        }

        const tailKey = `${hb.hostTick}|${hostTailFp}`;
        const unchanged =
            this.lastPollServerTailKey !== null &&
            this.lastPollServerTailKey === tailKey &&
            localAtHostTick === hostTailFp;

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
    }): boolean {
        const local = this.session.getLatestFingerprint();
        if (!local || heartbeat.hostTick == null || heartbeat.hostFingerprint == null) {
            return false;
        }
        if (local.tick === heartbeat.hostTick && local.fp === heartbeat.hostFingerprint) {
            return true;
        }
        // Paused for orders at T while the host has already published fp for completed tick T (stream
        // one ahead of checkpoint gameTick). Replay lands here legitimately — do not fail recovery.
        if (this.session.isPausedForOrderSync() && heartbeat.hostTick === local.tick + 1) {
            return true;
        }
        return false;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private setSyncDetails(message: string | null): void {
        this.emit('sync-details', message);
    }

    private setSyncStatus(status: BattleNetEventMap['sync-status'], details: string | null = null): void {
        this.emit('sync-status', status);
        this.setSyncDetails(details);
    }

    private getSnapshotFingerprint(state: SerializedGameState): string | null {
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
        this.session.loadFromSnapshot(snapshot.state);
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
    ): Promise<boolean> {
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.session.loadFromSnapshot(state);
        await this.replayOrdersSince(replaySinceTick);
        const heartbeat = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
        return this.isFingerprintAlignedWithHeartbeat(heartbeat);
    }

    /** Host-persisted battle start + full order log replay (tick 0 baseline). */
    private async performInitialStateReplay(): Promise<boolean> {
        const initial = await this.api.getBattleInitialState(this.lobbyId, this.gameId, this.playerId);
        if (initial == null) {
            return false;
        }
        return this.applyAuthoritativeStateAndCheckAlignment(initial.state, 0);
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
                    initialHash: this.getSnapshotFingerprint(latestSnapshot.state),
                },
            });
            return this.applyAuthoritativeStateAndCheckAlignment(latestSnapshot.state, latestSnapshot.tick);
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
                return this.applyAuthoritativeStateAndCheckAlignment(initial.state, 0);
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
                this.setSyncStatus(initialSuccess ? 'synced' : 'failed');
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
                const heartbeat = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
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
                    this.session.loadFromSnapshot(snapshot.state);
                    await this.replayOrdersSince(snapshot.tick);
                    const hbLate = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
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
                    if (!synced && beforeInitialReplayTick === 0) {
                        const restoredLatest = await this.tryBootstrapFromLatestCheckpoint();
                        if (restoredLatest) {
                            const hbAfterRestore = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
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
                this.setSyncStatus('synced');
            } else {
                console.error(`[BattleNet] recovery failed for "${reason}"`);
                this.setSyncStatus('failed');
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
        };
    }
}
