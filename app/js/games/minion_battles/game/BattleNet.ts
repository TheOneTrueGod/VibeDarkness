import type { LobbyClient } from '../../../LobbyClient';
import type { BattleOrder, SerializedGameState } from './types';

export interface BattleSessionHandle {
    getEngineTick(): number;
    getLatestFingerprint(): { tick: number; fp: string } | null;
    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string }>;
    getInitialFingerprint(): string;
    getSerializedSnapshot(): SerializedGameState;
    getSerializedInitialState(): SerializedGameState;
    loadFromSnapshot(state: SerializedGameState): void;
    applyRemoteOrders(orders: Array<{ atTick: number; order: BattleOrder }>): void;
}

type BattleNetEventMap = {
    'sync-status': 'synced' | 'waiting_for_host' | 'resyncing' | 'failed';
    heartbeat: {
        hostTick: number;
        hostFingerprint: string | null;
        ordersTipTick: number;
        pausedAtTick: number | null;
        expectingFromPlayerIds: string[] | null;
        initialFingerprint: string | null;
    };
    'orders-applied': { count: number; source: 'poll' | 'submit' };
};

type Listener<K extends keyof BattleNetEventMap> = (payload: BattleNetEventMap[K]) => void;
type Unsub = () => void;

interface BattleApi {
    appendBattleOrder(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; atTick: number; order: BattleOrder; idHash?: string },
    ): Promise<{ accepted: boolean; idHash: string }>;
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
        body: { playerId: string; tick: number; state: SerializedGameState },
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

/** Minimum idle time after a poll finishes before the next heartbeat request. */
const HEARTBEAT_POLL_INTERVAL_MS = 2000;

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
        heartbeat: new Set(),
        'orders-applied': new Set(),
    };

    private heartbeatPollActive = false;
    private heartbeatPollTimeout: ReturnType<typeof setTimeout> | null = null;
    private fingerprintFlushTimer: ReturnType<typeof setInterval> | null = null;
    private visibilityHandler: (() => void) | null = null;
    private isPolling = false;
    private isRecovering = false;

    private readonly appliedOrderIdHashes = new Set<string>();
    private pendingFingerprintBatch: Array<{ tick: number; fp: string }> = [];
    private lastSnapshotTick: number | null = null;
    private lastOrderFetchSince = 0;
    /** Seen count from heartbeat.ordersRecordCount; detects new rows at same atTick as existing orders. */
    private lastSeenOrdersRecordCount = 0;
    private readonly recoveryAttemptTimesByReason = new Map<string, number[]>();

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

        const scheduleNextPoll = (): void => {
            if (!this.heartbeatPollActive) {
                return;
            }
            void this.pollOnce().finally(() => {
                if (!this.heartbeatPollActive) {
                    return;
                }
                this.heartbeatPollTimeout = setTimeout(() => {
                    this.heartbeatPollTimeout = null;
                    scheduleNextPoll();
                }, HEARTBEAT_POLL_INTERVAL_MS);
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

    async submitOrder(order: BattleOrder, atTick: number): Promise<void> {
        const idHash = hashOrderId(this.playerId, atTick, order);
        if (!this.appliedOrderIdHashes.has(idHash)) {
            this.appliedOrderIdHashes.add(idHash);
            this.session.applyRemoteOrders([{ atTick, order }]);
            this.emit('orders-applied', { count: 1, source: 'submit' });
        }

        const res = await this.api.appendBattleOrder(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            atTick,
            order,
            idHash,
        });
        this.appliedOrderIdHashes.add(res.idHash || idHash);
    }

    async saveInitialState(): Promise<void> {
        if (!this.isHost) {
            return;
        }
        const existing = await this.getBattleInitialState();
        if (existing != null) {
            return;
        }
        await this.api.saveBattleInitialState(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            state: this.session.getSerializedInitialState(),
            initialFingerprint: this.session.getInitialFingerprint(),
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
        await this.api.saveBattleSnapshot(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            tick,
            state,
        });
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
                pausedAtTick: hbRaw.pausedAtTick ?? null,
                expectingFromPlayerIds: hbRaw.expectingFromPlayerIds ?? null,
                initialFingerprint: hbRaw.initialFingerprint ?? null,
            };
            this.emit('heartbeat', hb);

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
            if (engineTick === hb.hostTick) {
                const local = this.session.getLatestFingerprint();
                if (local?.tick === engineTick && hb.hostFingerprint && local.fp === hb.hostFingerprint) {
                    this.emit('sync-status', 'synced');
                } else if (hb.hostFingerprint != null && !this.isHost) {
                    this.requestResync('hash-mismatch');
                }
            } else if (engineTick > hb.hostTick) {
                this.emit('sync-status', 'waiting_for_host');
            }

            if (this.isHost) {
                await this.flushFingerprints();
            }
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
            this.lastOrderFetchSince = untilTick + 1;
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
        return local.tick === heartbeat.hostTick && local.fp === heartbeat.hostFingerprint;
    }

    private async performInitialStateReplay(): Promise<boolean> {
        const initial = await this.api.getBattleInitialState(this.lobbyId, this.gameId, this.playerId);
        if (initial == null) {
            return false;
        }
        this.session.loadFromSnapshot(initial.state);
        await this.replayOrdersSince(0);
        const heartbeat = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
        return this.isFingerprintAlignedWithHeartbeat(heartbeat);
    }

    private async runDesyncRecovery(reason: string): Promise<void> {
        if (this.noteRecoveryAttempt(reason)) {
            console.error(`[BattleNet] recovery escalated: too many "${reason}" recoveries in 30s`);
            this.emit('sync-status', 'failed');
            return;
        }

        this.isRecovering = true;
        this.emit('sync-status', 'resyncing');
        try {
            if (reason === 'initial-state-mismatch') {
                const initialSuccess = await this.performInitialStateReplay();
                this.emit('sync-status', initialSuccess ? 'synced' : 'failed');
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
                const serverLatest = serverRange.records.at(-1) ?? null;
                if (localLatest != null && serverLatest != null && localLatest.fp !== serverLatest.fp) {
                    firstMismatchTick = Math.max(localLatest.tick, serverLatest.tick);
                } else {
                    firstMismatchTick = localTick;
                }
            }

            const snapshot = await this.api.getBattleSnapshot(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                atTick: Math.max(0, firstMismatchTick - 1),
            });

            let synced = false;
            if (snapshot != null) {
                this.session.loadFromSnapshot(snapshot.state);
                await this.replayOrdersSince(snapshot.tick);
                const heartbeat = await this.api.getBattleHeartbeat(this.lobbyId, this.gameId, this.playerId);
                synced = this.isFingerprintAlignedWithHeartbeat(heartbeat);
            }

            if (!synced) {
                synced = await this.performInitialStateReplay();
            }

            if (synced) {
                this.emit('sync-status', 'synced');
            } else {
                console.error(`[BattleNet] recovery failed for "${reason}"`);
                this.emit('sync-status', 'failed');
            }
        } catch (error) {
            console.error(`[BattleNet] recovery error for "${reason}"`, error);
            this.emit('sync-status', 'failed');
        } finally {
            this.isRecovering = false;
        }
    }

    private emit<K extends keyof BattleNetEventMap>(event: K, payload: BattleNetEventMap[K]): void {
        for (const cb of this.listeners[event]) {
            cb(payload);
        }
    }
}
