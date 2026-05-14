import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleOrder } from '../types';
import type { BattleNetContext } from './BattleNetContext';
import { BATTLE_NET_MAX_DEFERRED_ORDERS } from './constants';

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
                gameId: this.ctx.gameId,
                message: 'deferred order queue cap exceeded; requesting resync',
                context: { cap: BATTLE_NET_MAX_DEFERRED_ORDERS },
            });
            this.ctx.requestResync('deferred-queue-overflow');
            return;
        }
        this.deferredLocalOrders.push({ idHash, atTick, order, appliedLocally });
    }

    /** Apply a deferred row to the local engine once, before POST (used when ahead-of-host deferred without optimistic apply). */
    applyDeferredRowLocallyIfNeeded(item: DeferredOrderRow): void {
        if (item.appliedLocally) {
            return;
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
     * On resync: clears all in-flight order tracking but preserves the deferred queue so the
     * required local turns are not silently dropped (they're re-attempted after recovery).
     */
    resetLocalOptimisticOrdersOnResync(): void {
        this.appliedOrderIdHashes.clear();
        this.ourOrdersAwaitingServerRange.clear();
        this.serverRangeConfirmedOurOrderHashes.clear();
        this.hostCatchupHeartbeatStreak = 0;
        this.lastOrderFetchSince = 0;
        this.lastSeenOrdersRecordCount = 0;
        this.deferredFlushBlockedLogKey = null;
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
        for (const record of orderRange.orders) {
            if (typeof record.atTick !== 'number' || record.atTick > maxAtTick) {
                continue;
            }
            if (record.playerId === this.ctx.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(record.idHash);
                this.ourOrdersAwaitingServerRange.delete(record.idHash);
            }
            this.appliedOrderIdHashes.add(record.idHash);
        }
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
    async replayOrdersSince(sinceTick: number): Promise<{ maxAtTickObserved: number | null }> {
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
            const applyResult = this.ctx.session.applyRemoteOrders(toApply);
            for (const k of applyResult.newlyAppliedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            for (const k of applyResult.skippedKeys) {
                this.appliedOrderIdHashes.add(k);
            }
            this.ctx.events.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'poll' });
        }
        return { maxAtTickObserved };
    }
}
