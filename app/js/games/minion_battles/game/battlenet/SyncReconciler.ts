import type { BattleNetContext } from './BattleNetContext';
import type { BattleNetEventMap, NonHostHbPausePlaneSnap } from './types';

/**
 * Owns the heartbeat-driven reconciliation state for non-host clients (ahead/behind
 * streaks, last observed server pause plane) and the pure helpers used by BattleNet's
 * larger `reconcile*` state machines.
 *
 * The big stateful `reconcileFingerprintsEqualHostTick` / `reconcileNonHostAheadOfHostTail`
 * / `reconcileNonHostBehindHostTail` / `reconcileNonHostPausePlaneTransition` methods
 * still live on BattleNet and read/write state through this controller.
 */
export class SyncReconciler {
    /** Non-host: server `hostTick|hostFingerprint` seen on the previous poll (ahead-of-host streak). */
    private lastPollServerTailKey: string | null = null;
    /** Non-host: consecutive polls where we're ahead, agree through host tick, and tail unchanged. */
    private aheadWithUnchangedServerTailStreak = 0;
    /** Non-host: pause-plane snapshot from the previous heartbeat poll (transition detection). */
    private lastNonHostHbPausePlane: NonHostHbPausePlaneSnap | null = null;

    constructor(private readonly ctx: BattleNetContext) {}

    getLastPollServerTailKey(): string | null {
        return this.lastPollServerTailKey;
    }

    setLastPollServerTailKey(value: string | null): void {
        this.lastPollServerTailKey = value;
    }

    getAheadWithUnchangedServerTailStreak(): number {
        return this.aheadWithUnchangedServerTailStreak;
    }

    setAheadWithUnchangedServerTailStreak(value: number): void {
        this.aheadWithUnchangedServerTailStreak = value;
    }

    incrementAheadWithUnchangedServerTailStreak(): void {
        this.aheadWithUnchangedServerTailStreak += 1;
    }

    getLastNonHostHbPausePlane(): NonHostHbPausePlaneSnap | null {
        return this.lastNonHostHbPausePlane;
    }

    setLastNonHostHbPausePlane(value: NonHostHbPausePlaneSnap | null): void {
        this.lastNonHostHbPausePlane = value;
    }

    /** Resets the ahead/behind tail-key streak; called whenever heartbeat material changes. */
    resetNonHostAheadStreak(): void {
        this.lastPollServerTailKey = null;
        this.aheadWithUnchangedServerTailStreak = 0;
    }

    /** Emits `blocking-host-pause-plane` to the event bus (sugar around `events.emit`). */
    emitBlockingHostPausePlane(blocking: boolean): void {
        this.ctx.events.emit('blocking-host-pause-plane', { blocking });
    }

    snapshotHbPausePlane(hb: BattleNetEventMap['heartbeat']): NonHostHbPausePlaneSnap {
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

    pausePlaneKeyFromSnap(s: NonHostHbPausePlaneSnap): string {
        const expPart = Array.isArray(s.expectingFromPlayerIds) ? s.expectingFromPlayerIds.join(',') : '';
        const batch = s.orderBatchAtTick ?? '';
        return `${s.hostPaused ? 1 : 0}|${s.hostTick}|${s.hostFingerprint ?? ''}|${batch}|${expPart}`;
    }

    pausePlaneKeyFromHb(hb: BattleNetEventMap['heartbeat']): string {
        return this.pausePlaneKeyFromSnap(this.snapshotHbPausePlane(hb));
    }

    /**
     * Non-host: returns whether the local engine's parallel pause is "ahead" of the server
     * (blocks new optimistic order submission until host catches up).
     */
    computeBlockingNonHostPausePlane(engineTick: number, hb: BattleNetEventMap['heartbeat']): boolean {
        const localBatch = this.ctx.session.getWaitingForOrdersBatch();
        if (localBatch == null) {
            return false;
        }
        const hostParallel = hb.orderBatchAtTick;
        if (hostParallel != null && hostParallel !== localBatch.atTick) {
            return true;
        }
        return engineTick > hb.hostTick;
    }

    /**
     * Host-only edge case: local paused=true and host heartbeat paused=false can be safely
     * ignored while a parallel batch is mid-flight (the same atTick batch is just resolving).
     */
    hostPauseFlagMismatchBenignForParallelBatch(
        engineTick: number,
        hb: BattleNetEventMap['heartbeat'],
        local: { tick: number; fp: string; paused: boolean },
    ): boolean {
        if (!this.ctx.isHost) {
            return false;
        }
        if (local.paused === hb.hostPaused) {
            return false;
        }
        if (!(local.paused && !hb.hostPaused)) {
            return false;
        }
        if (!this.ctx.session.isPausedForOrderSync()) {
            return false;
        }
        const batch = this.ctx.session.getWaitingForOrdersBatch();
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

    isFingerprintAlignedWithHeartbeat(heartbeat: {
        hostTick: number | null;
        hostFingerprint: string | null;
        hostPaused?: boolean | null;
    }): boolean {
        if (heartbeat.hostTick == null || heartbeat.hostFingerprint == null) return false;
        let local = this.ctx.session.getLatestFingerprint();
        if (!local) return false;
        // Client may have replayed pending orders past the host's committed tick (e.g. host paused
        // waiting for the next order batch). Look up the fingerprint recorded at the host's tick
        // rather than rejecting alignment outright.
        if (local.tick > heartbeat.hostTick) {
            const range = this.ctx.session.getFingerprintRange(heartbeat.hostTick, heartbeat.hostTick);
            if (range.length === 0) return false;
            local = range[0];
        }
        if (local.tick !== heartbeat.hostTick || local.fp !== heartbeat.hostFingerprint) return false;
        if (heartbeat.hostPaused != null && local.paused !== heartbeat.hostPaused) return false;
        return true;
    }
}
