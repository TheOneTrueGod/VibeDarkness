import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleNetContext } from './BattleNetContext';
import type { OrderQueueController } from './OrderQueueController';
import type { SyncReconciler } from './SyncReconciler';
import { HOST_ANCHOR_RESYNC_MS, HOST_ANCHOR_WAIT_SHOW_MS } from './constants';
import type { BattleNetEventMap } from './types';

/**
 * Non-host: anchor wall-clock state machine for "host stalled after I submitted orders".
 *
 * Tracks the last `hostTick` we proved aligned at (`previouslySyncedAtTick`), the wall-clock
 * start of the current stall, and whether we already escalated to `requestResync` for this stall.
 */
export class HostAnchorWaitController {
    /** Non-host: last authoritative host completed tick proved aligned (fp match or POST accepted). */
    private previouslySyncedAtTick: number | null = null;
    /** Non-host: wall-clock ms when `shouldTrackHostAnchorWallWait` first became true for this stall. */
    private hostAnchorWaitStartedAtMs: number | null = null;
    /** Dedup repeated `requestResync` kicks while the stall persists across polls. */
    private hostAnchorResyncEmittedForCurrentStall = false;

    constructor(
        private readonly ctx: BattleNetContext,
        /** Lazy access to sibling controllers (set after construction via `bindSiblings`). */
        private siblings: {
            orderQueue: OrderQueueController;
            syncReconciler: SyncReconciler;
        } | null = null,
    ) {}

    bindSiblings(siblings: { orderQueue: OrderQueueController; syncReconciler: SyncReconciler }): void {
        this.siblings = siblings;
    }

    private readonly requireSiblings = (): {
        orderQueue: OrderQueueController;
        syncReconciler: SyncReconciler;
    } => {
        if (this.siblings == null) {
            throw new Error('HostAnchorWaitController: bindSiblings() must be called before use');
        }
        return this.siblings;
    };

    getPreviouslySyncedAtTick(): number | null {
        return this.previouslySyncedAtTick;
    }

    setPreviouslySyncedAtTick(value: number | null): void {
        this.previouslySyncedAtTick = value;
    }

    getHostAnchorWaitStartedAtMs(): number | null {
        return this.hostAnchorWaitStartedAtMs;
    }

    setHostAnchorWaitStartedAtMs(value: number | null): void {
        this.hostAnchorWaitStartedAtMs = value;
    }

    getHostAnchorResyncEmittedForCurrentStall(): boolean {
        return this.hostAnchorResyncEmittedForCurrentStall;
    }

    setHostAnchorResyncEmittedForCurrentStall(value: boolean): void {
        this.hostAnchorResyncEmittedForCurrentStall = value;
    }

    /** Clears wall-clock + emit dedup; also emits `host-anchor-wait` idle to clear UI. */
    clearHostAnchorWaitState(): void {
        this.hostAnchorWaitStartedAtMs = null;
        this.hostAnchorResyncEmittedForCurrentStall = false;
        this.ctx.events.emit('host-anchor-wait', { phase: 'idle', elapsedMs: 0 });
    }

    /**
     * Record that we just proved alignment with the host at `hostAlignedTick`
     * (resets the wall-clock stall machine).
     */
    notePreviouslySyncedAnchorTick(hostAlignedTick: number): void {
        this.previouslySyncedAtTick = hostAlignedTick;
        this.clearHostAnchorWaitState();
    }

    /**
     * Returns true iff the controller should advance its wall-clock for this poll
     * (non-host, host paused at the anchor tick, with at least one in-flight POST or
     * optimistic parallel ahead of host).
     */
    shouldTrackHostAnchorWallWait(engineTick: number, hb: BattleNetEventMap['heartbeat']): boolean {
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
        const { orderQueue } = this.requireSiblings();
        const hasOutboundOrderAckWait =
            orderQueue.getDeferredLocalOrders().length > 0 ||
            orderQueue.getOurOrdersAwaitingServerRange().size > 0;
        const optimisticParallelAhead =
            this.ctx.session.isPausedForOrderSync() && engineTick > hb.hostTick;
        return hasOutboundOrderAckWait || optimisticParallelAhead;
    }

    /**
     * Non-host: heartbeat-driven wall clock for "host stalled on anchor tick"; emits the
     * bottom-centre wait UI when the stall lasts past {@link HOST_ANCHOR_WAIT_SHOW_MS} and
     * triggers `requestResync` once past {@link HOST_ANCHOR_RESYNC_MS}.
     */
    refreshHostAnchorWaitAndBlocking(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const { orderQueue, syncReconciler } = this.requireSiblings();
        const blockingPause = syncReconciler.computeBlockingNonHostPausePlane(engineTick, hb);
        syncReconciler.emitBlockingHostPausePlane(blockingPause);

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

        if (
            elapsedMs >= HOST_ANCHOR_RESYNC_MS &&
            !this.hostAnchorResyncEmittedForCurrentStall &&
            !this.ctx.isRecovering
        ) {
            this.hostAnchorResyncEmittedForCurrentStall = true;
            phase = 'forcing_resync';
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.ctx.gameId,
                message:
                    'host anchor wait exceeded threshold; suspected stall after optimistic pause — forcing resync',
                context: {
                    elapsedMs,
                    previouslySyncedAtTick: this.previouslySyncedAtTick,
                    hostPaused: hb.hostPaused,
                    hostTick: hb.hostTick,
                    orderBatchAtTick: hb.orderBatchAtTick,
                    engineTick,
                    deferredCount: orderQueue.getDeferredLocalOrders().length,
                    outboundAckWaitCount: orderQueue.getOurOrdersAwaitingServerRange().size,
                    waitingBatch: this.ctx.session.getWaitingForOrdersBatch(),
                },
            });
            this.ctx.requestResync('host-stuck-after-submit');
        }

        this.ctx.events.emit('host-anchor-wait', { phase, elapsedMs });
    }
}
