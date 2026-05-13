import { traceBattleHeartbeatLine } from '../../../../battleHeartbeatTrace';
import {
    HEARTBEAT_POLL_IDLE_MS,
    HEARTBEAT_POLL_INTERVAL_HIDDEN_MS,
    HEARTBEAT_POLL_INTERVAL_MS,
} from '../../../../../../global_constants.js';
import type { BattleNetContext } from './BattleNetContext';
import type { OrderQueueController } from './OrderQueueController';
import type { SyncReconciler } from './SyncReconciler';
import type { BattleNetEventMap, BattleNetPollOnceOptions } from './types';

interface PollLoopSiblings {
    orderQueue: OrderQueueController;
    syncReconciler: SyncReconciler;
    /** Performs a single poll iteration; PollLoop owns the timer/visibility plumbing around it. */
    pollOnce: (opts?: BattleNetPollOnceOptions) => Promise<void>;
}

/**
 * Owns the battle-heartbeat poll loop lifecycle: the active flag, scheduling timer,
 * `visibilitychange` listener, and the small set of streak counters that have to
 * be reset on every `start()`. The actual `pollOnce` body lives on `BattleNet`
 * (it remains tightly coupled with several controllers) and is invoked through
 * the `pollOnce` callback in `bindSiblings`.
 */
export class PollLoop {
    private heartbeatPollActive = false;
    private heartbeatPollTimeout: ReturnType<typeof setTimeout> | null = null;
    private visibilityHandler: (() => void) | null = null;
    /** Set by `BattleNet.pollOnce` while a poll iteration is running. */
    isPolling = false;
    /** Increments for each `pollOnce` attempt that acquired the poll lock. */
    heartbeatPollSeq = 0;
    /**
     * Non-host: heartbeat polls while sync status is `waiting_for_host` and the engine is paused
     * for parallel order sync. Used by `BattleNet.pollOnce`'s `waiting_for_host` watchdog.
     */
    waitingForHostUiPollStreak = 0;

    constructor(
        private readonly ctx: BattleNetContext,
        private siblings: PollLoopSiblings | null = null,
    ) {}

    bindSiblings(siblings: PollLoopSiblings): void {
        this.siblings = siblings;
    }

    private readonly requireSiblings = (): PollLoopSiblings => {
        if (this.siblings == null) {
            throw new Error('PollLoop: bindSiblings() must be called before use');
        }
        return this.siblings;
    };

    isActive(): boolean {
        return this.heartbeatPollActive;
    }

    /**
     * True when we should poll at the foreground cadence ({@link HEARTBEAT_POLL_INTERVAL_MS})
     * rather than the slower idle cadence ({@link HEARTBEAT_POLL_IDLE_MS}).
     */
    needsActiveHeartbeatPolling(): boolean {
        const { orderQueue } = this.requireSiblings();
        if (this.ctx.isRecovering) {
            return true;
        }
        if (this.ctx.session.isPausedForOrderSync()) {
            return true;
        }
        if (orderQueue.getDeferredLocalOrders().length > 0) {
            return true;
        }
        if (this.ctx.isHost) {
            return false;
        }
        return this.ctx.session.isEngineSimulationRunning();
    }

    /** Mirrors the latest heartbeat + a snapshot of all sync-relevant state onto `window.__minionBattlesSyncDebug`. */
    publishSyncDebugBridge(hb: BattleNetEventMap['heartbeat']): void {
        if (typeof window === 'undefined') {
            return;
        }
        const { orderQueue } = this.requireSiblings();
        const bridge = window as unknown as {
            __minionBattlesSyncDebug?: Record<string, unknown>;
        };
        const hostTailTick =
            typeof hb.hostTick === 'number' && !Number.isNaN(hb.hostTick) ? hb.hostTick : null;
        const localAtServerTail =
            hostTailTick != null
                ? this.ctx.session.getFingerprintRange(hostTailTick, hostTailTick)[0] ?? null
                : null;

        bridge.__minionBattlesSyncDebug = {
            lobbyId: this.ctx.lobbyId,
            gameId: this.ctx.gameId,
            playerId: this.ctx.playerId,
            isHost: this.ctx.isHost,
            lastHeartbeat: hb,
            lastPollAt: Date.now(),
            pausedForOrderSync: this.ctx.session.isPausedForOrderSync(),
            waitingForHostUiPollStreak: this.waitingForHostUiPollStreak,
            deferredOrderCount: orderQueue.getDeferredLocalOrders().length,
            orderSyncSummary: orderQueue.getOrderSyncSummary(),
            stuckHeartbeats: orderQueue.getHostCatchupHeartbeatStreak(),
            lastOrderFetchSince: orderQueue.getLastOrderFetchSince(),
            lastSeenOrdersRecordCount: orderQueue.getLastSeenOrdersRecordCount(),
            engineTick: this.ctx.session.getEngineTick(),
            clientTick: this.ctx.session.getEngineTick(),
            localLatestFingerprint: this.ctx.session.getLatestFingerprint(),
            /** Ring row at `heartbeat.hostTick` — compare to `hostFingerprint` when engine tick is ahead of tail. */
            localFingerprintAtServerTail: localAtServerTail,
            syncStatus: this.ctx.syncStatus.getStatus(),
            syncDetails: this.ctx.syncStatus.getDetails(),
            heartbeatMaterialKey: this.ctx.heartbeatState.getMaterialKey(),
            heartbeatMaterialChanged: this.ctx.heartbeatState.didLastPollChangeMaterial(),
        };
    }

    start(): void {
        const { orderQueue, syncReconciler, pollOnce } = this.requireSiblings();
        if (this.heartbeatPollActive) {
            console.warn('[BattleNet] start() ignored — heartbeat poll already active', {
                lobbyId: this.ctx.lobbyId,
                gameId: this.ctx.gameId,
                playerId: this.ctx.playerId,
                isHost: this.ctx.isHost,
            });
            return;
        }
        this.heartbeatPollActive = true;
        console.info('[BattleNet] start() — heartbeat poll loop', {
            lobbyId: this.ctx.lobbyId,
            gameId: this.ctx.gameId,
            playerId: this.ctx.playerId,
            isHost: this.ctx.isHost,
        });
        traceBattleHeartbeatLine('BattleNet.start', {
            traceInstanceId: this.ctx.heartbeatTraceInstanceId,
            lobbyId: this.ctx.lobbyId,
            gameId: this.ctx.gameId,
            playerId: this.ctx.playerId,
            isHost: this.ctx.isHost,
        });
        orderQueue.setHostCatchupHeartbeatStreak(0);
        this.waitingForHostUiPollStreak = 0;
        syncReconciler.setLastPollServerTailKey(null);
        syncReconciler.setAheadWithUnchangedServerTailStreak(0);
        if (!this.ctx.isHost) {
            syncReconciler.setLastNonHostHbPausePlane(null);
        }

        const scheduleNextPoll = (): void => {
            if (!this.heartbeatPollActive) {
                return;
            }
            void pollOnce({ pollSource: 'timer' }).finally(() => {
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
                const needsActive = this.needsActiveHeartbeatPolling();
                const visibilityHidden =
                    typeof document !== 'undefined' && document.visibilityState === 'hidden';
                traceBattleHeartbeatLine('poll schedule arm', {
                    traceInstanceId: this.ctx.heartbeatTraceInstanceId,
                    lobbyId: this.ctx.lobbyId,
                    playerId: this.ctx.playerId,
                    delayMs: delay,
                    foregroundMs,
                    needsActiveHeartbeatPolling: needsActive,
                    visibilityHidden,
                });
                this.heartbeatPollTimeout = setTimeout(() => {
                    this.heartbeatPollTimeout = null;
                    traceBattleHeartbeatLine('poll timer fired', {
                        traceInstanceId: this.ctx.heartbeatTraceInstanceId,
                        lobbyId: this.ctx.lobbyId,
                        playerId: this.ctx.playerId,
                    });
                    scheduleNextPoll();
                }, delay);
            });
        };
        scheduleNextPoll();

        this.visibilityHandler = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                traceBattleHeartbeatLine('visibilitychange → pollOnce', {
                    traceInstanceId: this.ctx.heartbeatTraceInstanceId,
                    lobbyId: this.ctx.lobbyId,
                    playerId: this.ctx.playerId,
                });
                void pollOnce({ pollSource: 'visibility' });
            }
        };
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.visibilityHandler);
        }

        this.ctx.fingerprintBatcher.startPeriodicFlush(1000);
    }

    stop(): void {
        console.info('[BattleNet] stop() — tearing down heartbeat poll', {
            lobbyId: this.ctx.lobbyId,
            gameId: this.ctx.gameId,
            playerId: this.ctx.playerId,
            isHost: this.ctx.isHost,
            hadActivePoll: this.heartbeatPollActive,
        });
        traceBattleHeartbeatLine('BattleNet.stop', {
            traceInstanceId: this.ctx.heartbeatTraceInstanceId,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            hadActivePoll: this.heartbeatPollActive,
        });
        this.heartbeatPollActive = false;
        if (this.heartbeatPollTimeout != null) {
            clearTimeout(this.heartbeatPollTimeout);
            this.heartbeatPollTimeout = null;
        }
        this.ctx.fingerprintBatcher.stopPeriodicFlush();
        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        this.visibilityHandler = null;
    }
}
