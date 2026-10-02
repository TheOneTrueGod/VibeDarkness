import type { BattleApi } from './types';
import type { CanonicalToken } from './canonicalToken';
import { isCanonicalTokenCurrent } from './canonicalToken';
import { logToLobbyLog } from '../../../../lobbyLog';
import type { LobbyClient } from '../../../../LobbyClient';

export interface FingerprintBatcherConfig {
    api: BattleApi;
    isHost: boolean;
    lobbyId: string;
    gameId: string;
    playerId: string;
    /** Current engine epoch for token staleness checks. */
    getCurrentEngineEpoch?: () => number;
}

/**
 * Host-only batch of fingerprint rows queued by the engine, periodically flushed as
 * `appendBattleFingerprints` POSTs. Failed flushes are re-prepended for retry.
 */
export class FingerprintBatcher {
    private pendingBatch: Array<{ tick: number; fp: string; paused: boolean; adminReason?: string }> = [];
    private flushTimer: ReturnType<typeof setInterval> | null = null;
    private flushing = false;
    /** Dedupe stale-token diagnostic lines per episode. */
    private lastStaleTokenEpisodeKey: string | null = null;

    constructor(private readonly config: FingerprintBatcherConfig) {}

    queueFingerprint(tick: number, fp: string, paused: boolean, adminReason?: string, token?: CanonicalToken | null): void {
        if (!this.config.isHost) {
            return;
        }

        // Check token validity before queueing
        const currentEngineEpoch = this.config.getCurrentEngineEpoch?.() ?? 0;
        if (!isCanonicalTokenCurrent(token, currentEngineEpoch)) {
            // Dedupe: one diag line per episode (same token/current epoch pair), not per tick.
            const episodeKey = `stale-token:${token?.engineEpoch ?? 'none'}:${currentEngineEpoch}`;
            if (this.lastStaleTokenEpisodeKey !== episodeKey) {
                this.lastStaleTokenEpisodeKey = episodeKey;
                logToLobbyLog({
                    lobbyClient: this.config.api as unknown as LobbyClient,
                    lobbyId: this.config.lobbyId,
                    playerId: this.config.playerId,
                    tick,
                    severity: 'warn',
                    logType: 'battleSync',
                    gameId: this.config.gameId,
                    message: 'diag: queueFingerprint skipped (stale or missing token)',
                    context: {
                        tickRequested: tick,
                        tokenEpoch: token?.engineEpoch ?? null,
                        currentEpoch: currentEngineEpoch,
                    },
                });
            }
            return;
        }

        this.lastStaleTokenEpisodeKey = null;
        this.pendingBatch.push(adminReason ? { tick, fp, paused, adminReason } : { tick, fp, paused });
    }

    /** Visible for testing; not part of the long-term controller contract. */
    getPendingCount(): number {
        return this.pendingBatch.length;
    }

    startPeriodicFlush(intervalMs: number): void {
        if (!this.config.isHost || this.flushTimer != null) {
            return;
        }
        this.flushTimer = setInterval(() => {
            void this.flush();
        }, intervalMs);
    }

    stopPeriodicFlush(): void {
        if (this.flushTimer != null) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }

    async flush(): Promise<void> {
        if (!this.config.isHost || this.pendingBatch.length === 0 || this.flushing) {
            return;
        }
        this.flushing = true;
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        try {
            await this.config.api.appendBattleFingerprints(this.config.lobbyId, this.config.gameId, {
                playerId: this.config.playerId,
                records: batch,
            });
        } catch (_error) {
            this.pendingBatch = batch.concat(this.pendingBatch);
        } finally {
            this.flushing = false;
        }
    }
}
