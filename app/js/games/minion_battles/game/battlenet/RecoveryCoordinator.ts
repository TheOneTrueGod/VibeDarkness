import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLogBattleSync } from '../../../../lobbyLog';
import { traceBattleHeartbeatLine } from '../../../../battleHeartbeatTrace';
import { sleep } from './helpers/heartbeatTiming';
import { getSnapshotFingerprint } from './helpers/snapshotFingerprint';
import { INITIAL_STATE_MAX_RETRIES, INITIAL_STATE_RETRY_DELAY_MS } from './constants';
import type { BattleNetContext } from './BattleNetContext';
import type { OrderQueueController } from './OrderQueueController';
import type { SyncReconciler } from './SyncReconciler';
import type { SerializedGameState } from '../types';

/**
 * Orchestrates desync recovery: tracks the per-reason attempt budget and runs the
 * tiered recovery strategy (initial-state retry → latest checkpoint → targeted
 * snapshot → initial-state replay → safety-net checkpoint restore).
 *
 * Exposes `isRecovering` so the rest of `BattleNet` can short-circuit poll/order
 * activity while a recovery pass is in flight.
 */
export class RecoveryCoordinator {
    private _isRecovering = false;
    private readonly recoveryAttemptTimesByReason = new Map<string, number[]>();

    constructor(
        private readonly ctx: BattleNetContext,
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
            throw new Error('RecoveryCoordinator: bindSiblings() must be called before use');
        }
        return this.siblings;
    };

    get isRecovering(): boolean {
        return this._isRecovering;
    }

    /** Mostly for tests; recovery flips this internally inside `runDesyncRecovery`. */
    setIsRecovering(value: boolean): void {
        this._isRecovering = value;
    }

    /**
     * Records a recovery attempt; returns `true` iff the per-reason attempt window
     * already had more than 3 attempts in the last 30s (caller should escalate to `failed`).
     */
    noteRecoveryAttempt(reason: string): boolean {
        const now = Date.now();
        const cutoff = now - 30_000;
        const attempts = this.recoveryAttemptTimesByReason.get(reason) ?? [];
        const freshAttempts = attempts.filter((t) => t >= cutoff);
        freshAttempts.push(now);
        this.recoveryAttemptTimesByReason.set(reason, freshAttempts);
        return freshAttempts.length > 3;
    }

    /**
     * Loads the newest persisted battle snapshot (`GET snapshot` without atTick),
     * replays queued orders from that checkpoint tick onward, returns true iff a snapshot existed.
     * Used when joining/reloading mid-battle so the client resumes at host parity instead of frame 1.
     */
    async tryBootstrapFromLatestCheckpoint(): Promise<boolean> {
        const { orderQueue } = this.requireSiblings();
        const snapshot = await this.ctx.api.getBattleSnapshot(this.ctx.lobbyId, this.ctx.gameId, {
            playerId: this.ctx.playerId,
        });
        if (snapshot == null) {
            this.ctx.snapshotPersistence.setLastBootstrapSnapshotTick(null);
            return false;
        }
        this.ctx.snapshotPersistence.setLastBootstrapSnapshotTick(snapshot.tick);
        orderQueue.getOurOrdersAwaitingServerRange().clear();
        orderQueue.getServerRangeConfirmedOurOrderHashes().clear();
        this.ctx.session.loadFromSnapshot(snapshot.state, {
            checkpointRuntimeFingerprintHex: snapshot.synchash,
        });
        await orderQueue.replayOrdersSince(snapshot.tick + 1);
        orderQueue.setLastOrderFetchSince(0);
        orderQueue.setLastSeenOrdersRecordCount(0);
        return true;
    }

    /**
     * Fresh client init fingerprint disagrees with server's canonical initial fingerprint —
     * catch up via the latest persisted checkpoint before falling back to initial snapshot + orders.
     */
    async recoverFromLobbyInitialFingerprintMismatch(): Promise<boolean> {
        return this.recoverFromInitialStateMismatchWithRetry();
    }

    /**
     * @param replaySinceTick Minimum `atTick` **inclusive** for `replayOrdersSince`. After a persisted
     * checkpoint with envelope `tick` `T`, pass `T + 1`. For initial-state replay pass `0`.
     */
    private async applyAuthoritativeStateAndCheckAlignment(
        state: SerializedGameState,
        replaySinceTick: number,
        checkpointRuntimeFingerprintHex?: string | null,
    ): Promise<boolean> {
        const { orderQueue, syncReconciler } = this.requireSiblings();
        orderQueue.getOurOrdersAwaitingServerRange().clear();
        orderQueue.getServerRangeConfirmedOurOrderHashes().clear();
        this.ctx.session.loadFromSnapshot(state, { checkpointRuntimeFingerprintHex });
        await orderQueue.replayOrdersSince(replaySinceTick);
        const heartbeat = await this.ctx.heartbeatHttp.getBattleHeartbeatThrottled({
            tracePhase: 'recovery_apply_authoritative_alignment',
        });
        return syncReconciler.isFingerprintAlignedWithHeartbeat(heartbeat);
    }

    /** Host-persisted battle start + full order log replay (tick 0 baseline). */
    private async performInitialStateReplay(): Promise<boolean> {
        const initial = await this.ctx.api.getBattleInitialState(
            this.ctx.lobbyId,
            this.ctx.gameId,
            this.ctx.playerId,
        );
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
        const local = this.ctx.session.getLatestFingerprint();
        const localTick = this.ctx.session.getEngineTick();

        const latestSnapshot = await this.ctx.api.getBattleSnapshot(this.ctx.lobbyId, this.ctx.gameId, {
            playerId: this.ctx.playerId,
        });
        if (latestSnapshot != null) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: localTick,
                severity: 'info',
                gameId: this.ctx.gameId,
                message: 'initial-state mismatch healed from latest snapshot',
                context: {
                    localTick,
                    localHash: local?.fp ?? null,
                    initialTick: latestSnapshot.tick,
                    initialHash: getSnapshotFingerprint(latestSnapshot.state, latestSnapshot.synchash),
                },
            });
            return this.applyAuthoritativeStateAndCheckAlignment(
                latestSnapshot.state,
                latestSnapshot.tick + 1,
                latestSnapshot.synchash,
            );
        }

        for (let attempt = 1; attempt <= INITIAL_STATE_MAX_RETRIES; attempt++) {
            const initial = await this.ctx.api.getBattleInitialState(
                this.ctx.lobbyId,
                this.ctx.gameId,
                this.ctx.playerId,
            );
            if (initial != null) {
                logToLobbyLogBattleSync({
                    lobbyClient: this.ctx.api as unknown as LobbyClient,
                    lobbyId: this.ctx.lobbyId,
                    playerId: this.ctx.playerId,
                    tick: localTick,
                    severity: 'warn',
                    gameId: this.ctx.gameId,
                    message: 'initial-state mismatch healed from initial_state.json after snapshot missing',
                    context: {
                        localTick,
                        localHash: local?.fp ?? null,
                        initialTick:
                            typeof initial.state.gameTick === 'number' ? initial.state.gameTick : null,
                        initialHash: initial.initialFingerprint,
                        retryAttempt: attempt,
                    },
                });
                this.ctx.syncStatus.setDetails(null);
                return this.applyAuthoritativeStateAndCheckAlignment(initial.state, 0, null);
            }

            this.ctx.syncStatus.setDetails('Failed to fetch initial state... retrying');
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: localTick,
                severity: 'warn',
                gameId: this.ctx.gameId,
                message: 'initial-state mismatch retry: initial state missing',
                context: {
                    localTick,
                    localHash: local?.fp ?? null,
                    retryAttempt: attempt,
                    retryInMs: INITIAL_STATE_RETRY_DELAY_MS,
                },
            });
            await sleep(INITIAL_STATE_RETRY_DELAY_MS);
        }

        return false;
    }

    async runDesyncRecovery(reason: string): Promise<void> {
        const { orderQueue, syncReconciler } = this.requireSiblings();
        if (this.noteRecoveryAttempt(reason)) {
            console.error(`[BattleNet] recovery escalated: too many "${reason}" recoveries in 30s`);
            this.ctx.syncStatus.setStatus('failed');
            return;
        }

        this._isRecovering = true;
        traceBattleHeartbeatLine('runDesyncRecovery begin', {
            traceInstanceId: this.ctx.heartbeatTraceInstanceId,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            reason,
        });
        this.ctx.syncStatus.setStatus('resyncing');
        this.ctx.resetForDesyncRecoveryEntry();
        try {
            if (reason === 'initial-state-mismatch') {
                const initialSuccess = await this.recoverFromInitialStateMismatchWithRetry();
                this.ctx.syncStatus.finalizeRecoveryOutcome(initialSuccess, reason);
                return;
            }

            const localTick = this.ctx.session.getEngineTick();
            const fromTick = Math.max(0, localTick - 600);
            const serverRange = await this.ctx.api.getBattleFingerprintsRange(this.ctx.lobbyId, this.ctx.gameId, {
                playerId: this.ctx.playerId,
                fromTick,
                toTick: localTick,
            });
            const localRange = this.ctx.session.getFingerprintRange(fromTick, localTick);
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
                const localLatest = this.ctx.session.getLatestFingerprint();
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
                const heartbeat = await this.ctx.heartbeatHttp.getBattleHeartbeatThrottled({
                    tracePhase: 'recovery_post_bootstrap_checkpoint',
                });
                synced = syncReconciler.isFingerprintAlignedWithHeartbeat(heartbeat);
            }

            if (!synced) {
                const requestedAtTick = Math.max(0, firstMismatchTick - 1);
                let snapshot = await this.ctx.api.getBattleSnapshot(this.ctx.lobbyId, this.ctx.gameId, {
                    playerId: this.ctx.playerId,
                    atTick: requestedAtTick,
                });
                // Disk layout only has pause checkpoints (e.g. snapshots/1.json). atTick=0 selects nothing.
                if (snapshot == null && requestedAtTick === 0) {
                    snapshot = await this.ctx.api.getBattleSnapshot(this.ctx.lobbyId, this.ctx.gameId, {
                        playerId: this.ctx.playerId,
                    });
                }
                if (snapshot != null) {
                    this.ctx.session.loadFromSnapshot(snapshot.state, {
                        checkpointRuntimeFingerprintHex: snapshot.synchash,
                    });
                    await orderQueue.replayOrdersSince(snapshot.tick + 1);
                    const hbLate = await this.ctx.heartbeatHttp.getBattleHeartbeatThrottled({
                        tracePhase: 'recovery_post_snapshot_replay',
                    });
                    synced = syncReconciler.isFingerprintAlignedWithHeartbeat(hbLate);
                }
                if (!synced) {
                    const beforeInitialReplayTick = this.ctx.session.getEngineTick();
                    const beforeInitialReplayFingerprint = this.ctx.session.getLatestFingerprint();
                    synced = await this.performInitialStateReplay();
                    const afterInitialReplayTick = this.ctx.session.getEngineTick();
                    const afterInitialReplayFingerprint = this.ctx.session.getLatestFingerprint();
                    // Safety patch: if we're still not aligned and the last attempt left the client on tick 0,
                    // restore the latest snapshot so the user doesn't appear stuck at the start of the battle.
                    if (!synced && afterInitialReplayTick === 0) {
                        const restoredLatest = await this.tryBootstrapFromLatestCheckpoint();
                        if (restoredLatest) {
                            const hbAfterRestore = await this.ctx.heartbeatHttp.getBattleHeartbeatThrottled({
                                tracePhase: 'recovery_after_restore_latest',
                            });
                            synced = syncReconciler.isFingerprintAlignedWithHeartbeat(hbAfterRestore);
                            logToLobbyLogBattleSync({
                                lobbyClient: this.ctx.api as unknown as LobbyClient,
                                lobbyId: this.ctx.lobbyId,
                                playerId: this.ctx.playerId,
                                tick: beforeInitialReplayTick,
                                severity: 'warn',
                                gameId: this.ctx.gameId,
                                message:
                                    'safety patch: restored latest snapshot after initial-state replay failed alignment (client stuck at tick 0)',
                                context: {
                                    localTickBeforeInitialReplay: beforeInitialReplayTick,
                                    localHashBeforeInitialReplay: beforeInitialReplayFingerprint?.fp ?? null,
                                    initialStateTick: afterInitialReplayTick,
                                    initialStateHash: afterInitialReplayFingerprint?.fp ?? null,
                                    restoredSnapshotTick: this.ctx.snapshotPersistence.getLastBootstrapSnapshotTick(),
                                    alignedAfterRestore: synced,
                                    reason,
                                },
                            });
                        }
                    }
                }
            }

            if (synced) {
                this.ctx.syncStatus.finalizeRecoveryOutcome(true, reason);
            } else {
                console.error(`[BattleNet] recovery failed for "${reason}"`);
                this.ctx.syncStatus.finalizeRecoveryOutcome(false, reason);
            }
        } catch (error) {
            console.error(`[BattleNet] recovery error for "${reason}"`, error);
            this.ctx.syncStatus.setStatus('failed');
        } finally {
            traceBattleHeartbeatLine('runDesyncRecovery end', {
                traceInstanceId: this.ctx.heartbeatTraceInstanceId,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                reason,
            });
            this._isRecovering = false;
        }
    }
}
