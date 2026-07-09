import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleOrder } from '../types';
import type { BattleNetContext } from './BattleNetContext';
import { BATTLE_NET_MAX_DEFERRED_ORDERS, BATTLE_NET_STAGED_REMOTE_ROWS_MAX } from './constants';
import { summarizeRemoteWireRowsForLog } from './helpers/orderWireLogSummary';
import type { RemoteOrderWireRow } from './types';

/** Common `toApply` row shape shared by all remote-row delivery paths (poll fetch, replay, heartbeat pastAppliedActions). */
export type PartitionableRemoteOrderRow = {
    atTick: number;
    order: BattleOrder;
    idHash: string;
    playerId?: string;
};

export interface DeferredOrderRow {
    idHash: string;
    atTick: number;
    order: BattleOrder;
    /** False when the order is queued but not yet applied to the local engine (ahead-of-host gate). */
    appliedLocally: boolean;
}

/**
 * Owns the local player-order pipeline: optimistic application, deferred POST queue,
 * tracking of in-flight orders awaiting server confirmation, and pagination cursors
 * for the server `getBattleOrdersRange` poll.
 *
 * Smaller helpers (queue mutations, watchdog logging, summary, reset on resync) live
 * here directly; the big submit/persist/flush state-machines remain on `BattleNet`
 * and access state via this controller until `slim_and_cleanup` finishes the move.
 */
export class OrderQueueController {
    private deferredLocalOrders: DeferredOrderRow[] = [];
    private readonly appliedOrderIdHashes = new Set<string>();
    private readonly ourOrdersAwaitingServerRange = new Set<string>();
    private readonly serverRangeConfirmedOurOrderHashes = new Set<string>();
    private lastOrderFetchSince = 0;
    /** Seen count from `heartbeat.ordersRecordCount`; detects new rows at same atTick as existing orders. */
    private lastSeenOrdersRecordCount = 0;
    /** Throttled log dedup for the deferred watchdog "branch" lines. */
    private deferredFlushBlockedLogKey: string | null = null;
    /** Non-host: heartbeat polls still waiting on a deferred POST while paused. */
    private hostCatchupHeartbeatStreak = 0;
    /** Non-host: `atTick` values where our POST was accepted but heartbeat may still expect us. */
    private acceptedOurPostAtTicks = new Set<number>();
    /**
     * Non-host: remote rows beyond both the host tail and the local pause plane — held until
     * {@link drainStagedRemoteRows} finds them applicable. Replaces the far-future skip (lobby
     * 0721BF) and the checkpoint-bootstrap soft-align (lobby 5E0F6B); keyed by wire `idHash` so a
     * later re-fetch of the same row dedupes naturally instead of registering a poisoned
     * {@link appliedOrderIdHashes} entry.
     */
    private readonly stagedRemoteRows = new Map<string, RemoteOrderWireRow>();

    constructor(private readonly ctx: BattleNetContext) {}

    getDeferredLocalOrders(): DeferredOrderRow[] {
        return this.deferredLocalOrders;
    }

    getAppliedOrderIdHashes(): Set<string> {
        return this.appliedOrderIdHashes;
    }

    getOurOrdersAwaitingServerRange(): Set<string> {
        return this.ourOrdersAwaitingServerRange;
    }

    getServerRangeConfirmedOurOrderHashes(): Set<string> {
        return this.serverRangeConfirmedOurOrderHashes;
    }

    getLastOrderFetchSince(): number {
        return this.lastOrderFetchSince;
    }

    setLastOrderFetchSince(value: number): void {
        this.lastOrderFetchSince = value;
    }

    getLastSeenOrdersRecordCount(): number {
        return this.lastSeenOrdersRecordCount;
    }

    setLastSeenOrdersRecordCount(value: number): void {
        this.lastSeenOrdersRecordCount = value;
    }

    getDeferredFlushBlockedLogKey(): string | null {
        return this.deferredFlushBlockedLogKey;
    }

    setDeferredFlushBlockedLogKey(value: string | null): void {
        this.deferredFlushBlockedLogKey = value;
    }

    getHostCatchupHeartbeatStreak(): number {
        return this.hostCatchupHeartbeatStreak;
    }

    setHostCatchupHeartbeatStreak(value: number): void {
        this.hostCatchupHeartbeatStreak = value;
    }

    incrementHostCatchupHeartbeatStreak(): void {
        this.hostCatchupHeartbeatStreak += 1;
    }

    replaceDeferredLocalOrders(next: DeferredOrderRow[]): void {
        this.deferredLocalOrders = next;
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

    hasDeferredOrderFor(unitId: string, atTick: number): boolean {
        return this.deferredLocalOrders.some(
            (row) => row.atTick === atTick && row.order.unitId === unitId,
        );
    }

    noteAcceptedOurPostAtTick(atTick: number): void {
        this.acceptedOurPostAtTicks.add(atTick);
    }

    hasAcceptedOurPostAtTick(atTick: number): boolean {
        return this.acceptedOurPostAtTicks.has(atTick);
    }

    getStagedRemoteRowCount(): number {
        return this.stagedRemoteRows.size;
    }

    /**
     * Splits remote rows into `applyNow` — canon-complete (`atTick <= hostTick`, true regardless of
     * live poll vs full replay: rows through the host's completed tail are settled history) or
     * needed right now (`atTick <=` the local engine's current parallel-order pause, the EC110E
     * bootstrap case) — and rows staged for later (`atTick` beyond both: a pipelining peer's
     * future rows). Staged rows are NOT registered in {@link appliedOrderIdHashes} and are not
     * reported as `skippedKeys` — they simply wait for {@link drainStagedRemoteRows} on a later
     * poll. Overflow past {@link BATTLE_NET_STAGED_REMOTE_ROWS_MAX} logs a warn and requests a
     * full resync rather than growing unbounded.
     */
    partitionApplicableRemoteRows<T extends PartitionableRemoteOrderRow>(
        rows: T[],
        opts: { hostTick: number; localPauseAtTick: number | null },
    ): { applyNow: T[]; stagedCount: number } {
        const applyNow: T[] = [];
        let stagedCount = 0;
        for (const row of rows) {
            if (row.atTick <= opts.hostTick || (opts.localPauseAtTick != null && row.atTick <= opts.localPauseAtTick)) {
                applyNow.push(row);
                continue;
            }
            stagedCount += 1;
            if (this.stagedRemoteRows.has(row.idHash)) {
                continue;
            }
            if (this.stagedRemoteRows.size >= BATTLE_NET_STAGED_REMOTE_ROWS_MAX) {
                logToLobbyLog({
                    lobbyClient: this.ctx.api as unknown as LobbyClient,
                    lobbyId: this.ctx.lobbyId,
                    playerId: this.ctx.playerId,
                    tick: this.ctx.session.getEngineTick(),
                    severity: 'warn',
                    logType: 'desync',
                    gameId: this.ctx.gameId,
                    message: 'staged remote row queue cap exceeded; requesting resync',
                    context: { cap: BATTLE_NET_STAGED_REMOTE_ROWS_MAX, idHash: row.idHash, atTick: row.atTick },
                });
                this.ctx.requestResync('staged-remote-rows-overflow');
                continue;
            }
            this.stagedRemoteRows.set(row.idHash, row);
        }
        return { applyNow, stagedCount };
    }

    /**
     * Re-partitions staged rows against the current `hostTick` / local pause plane and releases any
     * now-applicable rows (removing them from the map). Called once per non-host heartbeat poll,
     * before new rows are fetched, so a stalled peer's row is picked up as soon as the host (or our
     * own pause plane) catches up to it.
     */
    drainStagedRemoteRows(opts: { hostTick: number; localPauseAtTick: number | null }): RemoteOrderWireRow[] {
        if (this.stagedRemoteRows.size === 0) {
            return [];
        }
        const released: RemoteOrderWireRow[] = [];
        for (const [key, row] of this.stagedRemoteRows) {
            const atTick = row.atTick ?? row.gameTick;
            if (typeof atTick !== 'number') {
                continue;
            }
            if (atTick <= opts.hostTick || (opts.localPauseAtTick != null && atTick <= opts.localPauseAtTick)) {
                released.push(row);
                this.stagedRemoteRows.delete(key);
            }
        }
        return released;
    }

    deferLocalOrder(
        idHash: string,
        atTick: number,
        order: BattleOrder,
        appliedLocally: boolean,
    ): void {
        if (this.deferredLocalOrders.some((item) => item.idHash === idHash)) {
            return;
        }
        if (this.deferredLocalOrders.length >= BATTLE_NET_MAX_DEFERRED_ORDERS) {
            logToLobbyLog({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: atTick,
                severity: 'warn',
                logType: 'desync',
                gameId: this.ctx.gameId,
                message: 'deferred order queue cap exceeded; requesting resync',
                context: { cap: BATTLE_NET_MAX_DEFERRED_ORDERS },
            });
            this.ctx.requestResync('deferred-queue-overflow');
            return;
        }
        this.deferredLocalOrders.push({ idHash, atTick, order, appliedLocally });
    }

    /**
     * Apply a deferred row to the local engine once, before POST (used when ahead-of-host deferred
     * without optimistic apply).
     *
     * @returns `true` when the row's `atTick` is already in the past relative to the local engine
     *   (must not clamp-apply — lobby 39E984). Caller should POST then soft-align.
     */
    applyDeferredRowLocallyIfNeeded(item: DeferredOrderRow): boolean {
        if (item.appliedLocally) {
            return false;
        }
        const engineTick = this.ctx.session.getEngineTick();
        // Past-batch orders must not be clamp-applied onto the current tick (OrderManager.queueOrder
        // would rewrite atTick → gameTick and corrupt the pause plane).
        if (!this.ctx.isHost && item.atTick < engineTick) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'warn',
                logType: 'desync',
                gameId: this.ctx.gameId,
                message: 'applyDeferredRowLocallyIfNeeded: skipped past-batch apply (will POST then soft-align)',
                context: {
                    idHash: item.idHash,
                    atTick: item.atTick,
                    engineTick,
                    abilityId: item.order.abilityId,
                    unitId: item.order.unitId,
                },
            });
            this.appliedOrderIdHashes.add(item.idHash);
            this.ourOrdersAwaitingServerRange.add(item.idHash);
            item.appliedLocally = true;
            return true;
        }
        if (!this.appliedOrderIdHashes.has(item.idHash)) {
            const applyResult = this.ctx.session.applyRemoteOrders([
                {
                    atTick: item.atTick,
                    order: item.order,
                    idHash: item.idHash,
                    playerId: this.ctx.playerId,
                },
            ]);
            for (const k of applyResult.newlyAppliedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            for (const k of applyResult.skippedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            this.appliedOrderIdHashes.add(item.idHash);
            this.ctx.events.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'submit' });
            this.ourOrdersAwaitingServerRange.add(item.idHash);
        }
        item.appliedLocally = true;
        return false;
    }

    /**
     * Plain-English summary of the local engine's parallel order batch — emitted in deferred-flush
     * debug logs to explain whether the engine still has waiters or has moved on.
     */
    engineOrderSyncPauseSummary(): string {
        const b = this.ctx.session.getWaitingForOrdersBatch();
        if (!b) {
            return 'engine waitingForOrders=null (sim not in parallel order batch)';
        }
        const ids = b.waiters.map((w) => w.unitId).join(',');
        return `engine waitingForOrders atTick=${b.atTick}, ${b.waiters.length} waiter(s) [${ids}]`;
    }

    logDeferredWatchdogBranch(
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
            latestHeartbeatPausedAtTick: this.ctx.heartbeatState.getLatestPausedAtTick(),
            isPausedForOrderSync: this.ctx.session.isPausedForOrderSync(),
            waitingForOrdersBatch: this.ctx.session.getWaitingForOrdersBatch(),
            engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
            ...extraContext,
        };
        console.info('[BattleNet] deferred watchdog', context);
        logToLobbyLogBattleSync({
            lobbyClient: this.ctx.api as unknown as LobbyClient,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            tick: this.ctx.session.getEngineTick(),
            severity: 'info',
            gameId: this.ctx.gameId,
            message: 'deferred order watchdog branch',
            context,
        });
    }

    emitHostCatchupWaitState(): void {
        const targetTick =
            this.deferredLocalOrders.length > 0
                ? this.deferredLocalOrders.reduce((maxTick, row) => Math.max(maxTick, row.atTick), -1)
                : null;
        const blocking = this.deferredLocalOrders.length > 0;
        this.ctx.events.emit('host-catchup-wait', {
            blocking,
            stuckHeartbeats: this.hostCatchupHeartbeatStreak,
            hostTick: this.ctx.heartbeatState.getLatestHostTick(),
            targetTick,
            queuedCount: this.deferredLocalOrders.length,
        });
    }

    /**
     * On resync: clears all in-flight order tracking but preserves the deferred queue (and
     * {@link stagedRemoteRows}, not touched here) so neither required local turns nor already-seen
     * peer rows are silently dropped (both are re-attempted after recovery).
     */
    resetLocalOptimisticOrdersOnResync(): void {
        const deferredSnapshot = this.deferredLocalOrders.map((d) => ({
            idHash: d.idHash,
            atTick: d.atTick,
            unitId: d.order.unitId,
            abilityId: d.order.abilityId,
            appliedLocally: d.appliedLocally,
        }));
        this.appliedOrderIdHashes.clear();
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.acceptedOurPostAtTicks.clear();
        this.hostCatchupHeartbeatStreak = 0;
        this.lastOrderFetchSince = 0;
        this.lastSeenOrdersRecordCount = 0;
        this.deferredFlushBlockedLogKey = null;
        logToLobbyLogBattleSync({
            lobbyClient: this.ctx.api as unknown as LobbyClient,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            tick: this.ctx.session.getEngineTick(),
            severity: 'info',
            gameId: this.ctx.gameId,
            message: 'order queue: reset optimistic order tracking (desync recovery entry); deferred rows preserved',
            context: {
                isHost: this.ctx.isHost,
                deferredPreserved: deferredSnapshot,
                stagedRemoteRowCountPreserved: this.stagedRemoteRows.size,
            },
        });
    }

    /**
     * Mark merged server orders with `atTick <= maxAtTick` as already applied (by {@link appliedOrderIdHashes})
     * without running the engine. Used after loading a pause checkpoint whose envelope tick is `T`: every
     * row with `atTick <= T` is already baked into that snapshot, so the next order poll must not rescan-apply
     * them at the current `gameTick` (which would clamp historical `atTick` and re-run `movePath`, etc.).
     */
    async seedAppliedHashesForMergedOrdersThroughTick(maxAtTick: number): Promise<void> {
        if (maxAtTick < 0) {
            return;
        }
        const orderRange = await this.ctx.api.getBattleOrdersRange(this.ctx.lobbyId, this.ctx.gameId, {
            playerId: this.ctx.playerId,
            untilTick: maxAtTick,
        });
        let seeded = 0;
        let minObserved: number | null = null;
        let maxObserved: number | null = null;
        const sessionDedupeKeys: string[] = [];
        for (const record of orderRange.orders) {
            if (typeof record.atTick !== 'number' || record.atTick > maxAtTick) {
                continue;
            }
            seeded += 1;
            minObserved =
                minObserved == null ? record.atTick : Math.min(minObserved, record.atTick);
            maxObserved =
                maxObserved == null ? record.atTick : Math.max(maxObserved, record.atTick);
            if (record.playerId === this.ctx.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(record.idHash);
                this.ourOrdersAwaitingServerRange.delete(record.idHash);
            }
            this.appliedOrderIdHashes.add(record.idHash);
            sessionDedupeKeys.push(record.idHash);
        }
        if (sessionDedupeKeys.length > 0) {
            this.ctx.session.seedRemoteOrderDedupeKeys(sessionDedupeKeys);
        }
        logToLobbyLogBattleSync({
            lobbyClient: this.ctx.api as unknown as LobbyClient,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            tick: this.ctx.session.getEngineTick(),
            severity: 'info',
            gameId: this.ctx.gameId,
            message: 'order queue: seeded applied idHashes from merged server orders through checkpoint tick',
            context: {
                maxAtTick,
                mergedRowCount: orderRange.orders.length,
                seededRowCount: seeded,
                seededAtTickMin: minObserved,
                seededAtTickMax: maxObserved,
                isHost: this.ctx.isHost,
            },
        });
    }

    /**
     * Fetch merged server orders with `atTick >= sinceTick` and apply them; {@link BattleSession.applyRemoteOrders}
     * dedupes by `idHash` / `hashOrderId`. {@link OrderQueueController.getAppliedOrderIdHashes} is updated from the session result.
     * When replaying after loading a pause **checkpoint** whose envelope `tick` is `T`, callers must pass
     * `sinceTick = T + 1`: rows with `atTick <= T` are already reflected in that snapshot's sim state.
     * For `initial_state.json` bootstrap use `sinceTick = 0` so tick-0/1 rows are not skipped.
     *
     * @returns Maximum `atTick` among rows returned by the range fetch (including rows skipped as already-hashed),
     * or `null` when the response had no orders.
     */
    async replayOrdersSince(
        sinceTick: number,
        logCtx?: { label: string },
    ): Promise<{ maxAtTickObserved: number | null }> {
        const orderRange = await this.ctx.api.getBattleOrdersRange(this.ctx.lobbyId, this.ctx.gameId, {
            playerId: this.ctx.playerId,
            sinceTick,
        });
        let maxAtTickObserved: number | null = null;
        for (const record of orderRange.orders) {
            if (typeof record.atTick === 'number') {
                maxAtTickObserved =
                    maxAtTickObserved == null ? record.atTick : Math.max(maxAtTickObserved, record.atTick);
            }
        }
        const toApply: Array<{ atTick: number; order: BattleOrder; idHash: string; playerId: string }> = [];
        for (const record of orderRange.orders) {
            if (record.playerId === this.ctx.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(record.idHash);
                this.ourOrdersAwaitingServerRange.delete(record.idHash);
            }
            toApply.push({
                atTick: record.atTick,
                order: record.order,
                idHash: record.idHash,
                playerId: record.playerId,
            });
        }
        if (toApply.length > 0) {
            const localPauseAtTick = this.ctx.session.getWaitingForOrdersBatch()?.atTick ?? null;
            const hostTick = this.ctx.heartbeatState.getLatestHostTick();
            const { applyNow, stagedCount } = this.ctx.isHost
                ? { applyNow: toApply, stagedCount: 0 }
                : this.partitionApplicableRemoteRows(toApply, { hostTick, localPauseAtTick });
            const applyResult =
                applyNow.length > 0
                    ? this.ctx.session.applyRemoteOrders(applyNow)
                    : { newlyAppliedKeys: [], skippedKeys: [] };
            for (const k of applyResult.newlyAppliedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            for (const k of applyResult.skippedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            if (applyNow.length > 0) {
                this.ctx.events.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'poll' });
            }
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: this.ctx.session.getEngineTick(),
                severity: 'info',
                gameId: this.ctx.gameId,
                message: 'order queue: replayOrdersSince applied remote rows from range fetch',
                context: {
                    label: logCtx?.label ?? 'replayOrdersSince',
                    sinceTick,
                    wireRowCount: orderRange.orders.length,
                    toApplyCount: toApply.length,
                    stagedCount,
                    maxAtTickObserved,
                    newlyAppliedKeys: applyResult.newlyAppliedKeys,
                    skippedKeys: applyResult.skippedKeys,
                    rows: summarizeRemoteWireRowsForLog(applyNow),
                    isHost: this.ctx.isHost,
                },
            });
        } else if (logCtx != null) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: this.ctx.session.getEngineTick(),
                severity: 'log',
                gameId: this.ctx.gameId,
                message: 'order queue: replayOrdersSince range fetch returned no rows',
                context: {
                    label: logCtx.label,
                    sinceTick,
                    isHost: this.ctx.isHost,
                },
            });
        }
        return { maxAtTickObserved };
    }
}
