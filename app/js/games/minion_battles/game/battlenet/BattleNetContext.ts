import type { BattleEventBus } from './BattleEventBus';
import type { FingerprintBatcher } from './FingerprintBatcher';
import type { HeartbeatHttp } from './HeartbeatHttp';
import type { HeartbeatState } from './HeartbeatState';
import type { SnapshotPersistence } from './SnapshotPersistence';
import type { SyncReconciler } from './SyncReconciler';
import type { SyncStatusController } from './SyncStatusController';
import type { BattleApi, BattleSessionHandle } from './types';

/**
 * Read surface shared by all battlenet controllers — identity (lobby/game/player ids),
 * shared infrastructure (events, heartbeat, snapshots), and a small set of orchestrator
 * callbacks (e.g. `requestResync`) that are owned by the BattleNet orchestrator.
 *
 * Controllers should depend on this interface rather than `BattleNet` directly so that
 * tests can stand in a minimal mock context and so that cross-controller wiring stays
 * explicit.
 */
export interface BattleNetContext {
    readonly api: BattleApi;
    readonly session: BattleSessionHandle;
    readonly isHost: boolean;
    readonly lobbyId: string;
    readonly gameId: string;
    readonly playerId: string;
    readonly heartbeatTraceInstanceId: number;
    readonly events: BattleEventBus;
    readonly syncStatus: SyncStatusController;
    /** Streak + pause-plane snapshot state for non-host heartbeat reconciliation. */
    readonly syncReconciler: SyncReconciler;
    readonly heartbeatHttp: HeartbeatHttp;
    readonly heartbeatState: HeartbeatState;
    readonly fingerprintBatcher: FingerprintBatcher;
    readonly snapshotPersistence: SnapshotPersistence;
    /** True while a `runDesyncRecovery` pass is in flight. */
    readonly isRecovering: boolean;
    /** Trigger an asynchronous desync recovery (no-op when one is already running). */
    requestResync(reason: string): void;
    /** Non-host: record that we aligned through this server-completed tick (host-anchor UX). */
    notePreviouslySyncedAnchorTick(hostAlignedTick: number): void;
    /**
     * Called once at the start of {@link RecoveryCoordinator.runDesyncRecovery}: clears optimistic
     * order tracking and non-host heartbeat/reconciler hint state so recovery + the first post-
     * recovery poll are not polluted by pre-resync material keys and pause-plane snapshots.
     */
    resetForDesyncRecoveryEntry(): void;
}
