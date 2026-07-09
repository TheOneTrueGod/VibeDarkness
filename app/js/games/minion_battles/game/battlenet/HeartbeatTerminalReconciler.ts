import type { LobbyClient } from '../../../../LobbyClient';
import { logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleNetContext } from './BattleNetContext';
import { BATTLE_NET_T1_WAITING_POLLS, BATTLE_NET_T2_RESYNC_POLLS } from './constants';
import type { BattleNetEventMap, NonHostHbPausePlaneSnap } from './types';

/**
 * After each heartbeat poll, decides terminal sync UI status (`synced`, `optimistic_client_playahead`,
 * `waiting_for_host`, …) and whether to request full resync, using local fingerprint rows vs server tail.
 */
export class HeartbeatTerminalReconciler {
    constructor(private readonly ctx: BattleNetContext) {}

    private get sr() {
        return this.ctx.syncReconciler;
    }

    /** Host + non-host — last completed matches server tail. */
    reconcileFingerprintsEqualHostTick(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const local = this.ctx.session.getLatestFingerprint();
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused === hb.hostPaused
        ) {
            if (!this.ctx.isHost) {
                this.sr.resetNonHostAheadStreak();
                this.ctx.notePreviouslySyncedAnchorTick(hb.hostTick);
            }
            this.ctx.syncStatus.setStatus('synced');
            return;
        }
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused !== hb.hostPaused &&
            this.sr.hostPauseFlagMismatchBenignForParallelBatch(engineTick, hb, local)
        ) {
            this.ctx.syncStatus.setStatus('synced');
            return;
        }
        if (
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            local.fp === hb.hostFingerprint &&
            local.paused !== hb.hostPaused &&
            !this.ctx.isHost
        ) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.ctx.gameId,
                message: 'equal-tick fingerprint match but paused flag mismatched vs heartbeat hostPaused',
                context: {
                    engineTick,
                    localPausedRing: local.paused,
                    hostPaused: hb.hostPaused,
                    hostFingerprintTail: hb.hostFingerprint?.slice(0, 12),
                },
            });
            this.ctx.requestResync('pause-flag-equal-tick-mismatch');
            return;
        }
        if (
            this.ctx.isHost &&
            local != null &&
            local.tick === engineTick &&
            hb.hostFingerprint &&
            (local.fp !== hb.hostFingerprint || local.paused !== hb.hostPaused)
        ) {
            this.ctx.syncStatus.setStatus(
                'waiting_for_host',
                local.fp !== hb.hostFingerprint
                    ? 'Host runtime fingerprint does not match server storage tail.'
                    : 'Host pause flag does not match storage tail vs heartbeat.',
            );
            return;
        }
        if (!this.ctx.isHost && hb.hostFingerprint != null) {
            const rowAtTail = this.ctx.session.getFingerprintRange(engineTick, engineTick)[0];
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'error',
                gameId: this.ctx.gameId,
                message: 'equal-tick fingerprint mismatch vs heartbeat (non-host) — full resync',
                context: {
                    engineTick,
                    localLatestFpHead: local?.fp?.slice(0, 12) ?? null,
                    localLatestPaused: local?.paused ?? null,
                    hostFingerprintHead: hb.hostFingerprint.slice(0, 12),
                    hostPaused: hb.hostPaused,
                    rowAtTickFpHead: rowAtTail?.fp?.slice(0, 12) ?? null,
                    rowAtTickPaused: rowAtTail?.paused ?? null,
                },
            });
            this.ctx.requestResync(hb.hostFingerprintAdminReason ?? 'hash-mismatch');
        }
    }

    /**
     * Non-host: local engine tick is behind heartbeat `hostTick` while heartbeat material (`hostTick` + fp) changed.
     */
    reconcileNonHostBehindHostTail(
        engineTick: number,
        hb: BattleNetEventMap['heartbeat'],
        materialChanged: boolean,
    ): void {
        if (this.ctx.isHost || !materialChanged) {
            return;
        }
        if (engineTick >= hb.hostTick) {
            return;
        }
        if (hb.hostFingerprint == null || hb.hostFingerprint === '') {
            return;
        }
        logToLobbyLogBattleSync({
            lobbyClient: this.ctx.api as unknown as LobbyClient,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            tick: engineTick,
            severity: 'info',
            gameId: this.ctx.gameId,
            message:
                'non-host behind heartbeat tail after hostTick/hostFingerprint material change — allowing local catch-up (no immediate resync)',
            context: {
                engineTick,
                hostTick: hb.hostTick,
                hostFingerprintHead: hb.hostFingerprint.slice(0, 12),
            },
        });
    }

    /** Non-host: local sim past server completed tail — align finger/pause tails; never claim `synced` when optimistically paused ahead. */
    reconcileNonHostAheadOfHostTail(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        const localOrderPause = this.ctx.session.isPausedForOrderSync();

        if (hb.hostPaused && engineTick > hb.hostTick && !localOrderPause) {
            this.sr.resetNonHostAheadStreak();
            const exp = hb.expectingFromPlayerIds;
            const parallelClear = Array.isArray(exp) && exp.length === 0;
            const hostFp = hb.hostFingerprint;
            const agreeRow = this.ctx.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];
            this.logFingerprintDivergenceAtHostTailIfMismatched(engineTick, hb, agreeRow?.fp ?? null, hostFp);
            if (parallelClear && hostFp != null && hostFp !== '') {
                if (agreeRow != null && agreeRow.fp === hostFp) {
                    this.ctx.syncStatus.setStatus(
                        'optimistic_client_playahead',
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
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'info',
                gameId: this.ctx.gameId,
                message: 'non-host ahead of clamped server tail — optimistic_client_playahead (not resync)',
                context: {
                    engineTick,
                    hostTick: hb.hostTick,
                    hostPaused: hb.hostPaused,
                    orderBatchAtTick: hb.orderBatchAtTick,
                    expectingFromPlayerIds: exp,
                },
            });
            this.ctx.syncStatus.setStatus('optimistic_client_playahead', detail);
            return;
        }

        const hostTailFp = hb.hostFingerprint;
        if (hostTailFp == null) {
            this.sr.resetNonHostAheadStreak();
            if (localOrderPause) {
                this.ctx.syncStatus.setStatus('waiting_for_host');
            } else {
                this.ctx.syncStatus.setStatus('optimistic_client_playahead');
            }
            return;
        }

        const localRow = this.ctx.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];

        if (localRow != null && localRow.fp !== hostTailFp) {
            this.sr.resetNonHostAheadStreak();
            this.ctx.requestResync(hb.hostFingerprintAdminReason ?? 'hash-mismatch');
            return;
        }

        // Client ran through hostTick (paused=false) while host is still paused there
        // (hostPaused=true) is normal optimistic playahead — do not resync.
        // True anomaly: local ring says we paused at hostTick but host did not.
        if (localRow != null && localRow.paused === true && hb.hostPaused === false) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.ctx.gameId,
                message: 'ahead-of-host: fingerprint-row paused disagrees with heartbeat hostPaused at host tail',
                context: {
                    engineTick,
                    hostTick: hb.hostTick,
                    localPausedTail: localRow.paused,
                    hostPausedHb: hb.hostPaused,
                    fpTail: hostTailFp.slice(0, 12),
                },
            });
            this.sr.resetNonHostAheadStreak();
            this.ctx.requestResync('pause-flag-tail-mismatch');
            return;
        }

        if (localRow == null) {
            this.sr.resetNonHostAheadStreak();
            if (localOrderPause) {
                this.ctx.syncStatus.setStatus('waiting_for_host');
            } else {
                this.ctx.syncStatus.setStatus('optimistic_client_playahead');
            }
            return;
        }

        const localFpAtTail = localRow.fp;

        if (localOrderPause) {
            this.sr.resetNonHostAheadStreak();
            this.ctx.syncStatus.setStatus('waiting_for_host');
            return;
        }

        const tailKey = `${hb.hostTick}|${hostTailFp}`;
        const lastKey = this.sr.getLastPollServerTailKey();
        const unchanged = lastKey !== null && lastKey === tailKey && localFpAtTail === hostTailFp;

        if (unchanged) {
            this.sr.incrementAheadWithUnchangedServerTailStreak();
        } else {
            this.sr.setAheadWithUnchangedServerTailStreak(0);
        }
        this.sr.setLastPollServerTailKey(tailKey);

        if (this.sr.getAheadWithUnchangedServerTailStreak() >= BATTLE_NET_T2_RESYNC_POLLS) {
            this.sr.resetNonHostAheadStreak();
            this.ctx.requestResync('ahead-of-host');
            return;
        }

        if (this.sr.getAheadWithUnchangedServerTailStreak() >= BATTLE_NET_T1_WAITING_POLLS) {
            this.ctx.syncStatus.setStatus('optimistic_client_playahead');
            return;
        }

        this.ctx.syncStatus.setStatus('optimistic_client_playahead');
    }

    /**
     * Playahead divergence observability (5E0F6B): when {@link reconcileNonHostAheadOfHostTail} is about
     * to settle on `optimistic_client_playahead` while the local sim is ahead of the host's paused tail,
     * verify the local ring fingerprint at `hostTick` against the heartbeat's `hostFingerprint`. A
     * mismatch here means the two sims have genuinely diverged (not just staleness while the host
     * catches up) — log at `error` so it is easy to grep. Observability only: this never escalates to
     * resync itself, that stays on the existing align/desync paths.
     */
    private logFingerprintDivergenceAtHostTailIfMismatched(
        engineTick: number,
        hb: BattleNetEventMap['heartbeat'],
        localFp: string | null,
        hostFp: string | null,
    ): void {
        if (hostFp == null || hostFp === '' || localFp == null || localFp === hostFp) {
            return;
        }
        logToLobbyLogBattleSync({
            lobbyClient: this.ctx.api as unknown as LobbyClient,
            lobbyId: this.ctx.lobbyId,
            playerId: this.ctx.playerId,
            tick: engineTick,
            severity: 'error',
            logType: 'desync',
            gameId: this.ctx.gameId,
            message: 'playahead fingerprint divergence at host tail',
            context: {
                hostTick: hb.hostTick,
                localFp,
                hostFp,
                localBatchAtTick: this.ctx.session.getWaitingForOrdersBatch()?.atTick ?? null,
                engineTick,
            },
        });
    }

    /**
     * Non-host: when heartbeat pause plane changes vs the previous poll, verify fingerprints at the new
     * completed tail; resync only on mismatch.
     */
    reconcileNonHostPausePlaneTransition(
        prev: NonHostHbPausePlaneSnap,
        curr: BattleNetEventMap['heartbeat'],
        engineTick: number,
    ): void {
        if (this.ctx.isHost || this.ctx.isRecovering) {
            return;
        }
        if (this.sr.pausePlaneKeyFromSnap(prev) === this.sr.pausePlaneKeyFromHb(curr)) {
            return;
        }

        const hostFp = curr.hostFingerprint;
        if (hostFp == null || hostFp === '') {
            return;
        }

        const localRow = this.ctx.session.getFingerprintRange(curr.hostTick, curr.hostTick)[0];
        if (localRow != null && localRow.fp !== hostFp) {
            logToLobbyLogBattleSync({
                lobbyClient: this.ctx.api as unknown as LobbyClient,
                lobbyId: this.ctx.lobbyId,
                playerId: this.ctx.playerId,
                tick: engineTick,
                severity: 'warn',
                gameId: this.ctx.gameId,
                message: 'pause plane changed — fingerprint mismatch at server completed tail',
                context: {
                    engineTick,
                    hostTick: curr.hostTick,
                    hostFingerprintHead: hostFp.slice(0, 12),
                    prevPausePlane: this.sr.pausePlaneKeyFromSnap(prev),
                    nextPausePlane: this.sr.pausePlaneKeyFromHb(curr),
                },
            });
            this.sr.resetNonHostAheadStreak();
            this.ctx.requestResync('pause-plane-transition-hash-mismatch');
            return;
        }

        if (localRow != null && localRow.fp === hostFp) {
            if (!curr.hostPaused && engineTick >= curr.hostTick) {
                this.sr.resetNonHostAheadStreak();
                this.ctx.notePreviouslySyncedAnchorTick(curr.hostTick);
                this.ctx.syncStatus.setStatus('synced');
                return;
            }
            this.ctx.syncStatus.setStatus(
                'waiting_for_host',
                'Heartbeat pause plane updated; still waiting on server-completed tail.',
            );
        }
    }
}
