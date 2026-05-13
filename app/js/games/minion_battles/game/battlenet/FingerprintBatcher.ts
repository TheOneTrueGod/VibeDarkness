import type { BattleApi } from './types';

export interface FingerprintBatcherConfig {
    api: BattleApi;
    isHost: boolean;
    lobbyId: string;
    gameId: string;
    playerId: string;
}

/**
 * Host-only batch of fingerprint rows queued by the engine, periodically flushed as
 * `appendBattleFingerprints` POSTs. Failed flushes are re-prepended for retry.
 */
export class FingerprintBatcher {
    private pendingBatch: Array<{ tick: number; fp: string; paused: boolean }> = [];
    private flushTimer: ReturnType<typeof setInterval> | null = null;

    constructor(private readonly config: FingerprintBatcherConfig) {}

    queueFingerprint(tick: number, fp: string, paused: boolean): void {
        if (!this.config.isHost) {
            return;
        }
        this.pendingBatch.push({ tick, fp, paused });
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
        if (!this.config.isHost || this.pendingBatch.length === 0) {
            return;
        }
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        try {
            await this.config.api.appendBattleFingerprints(this.config.lobbyId, this.config.gameId, {
                playerId: this.config.playerId,
                records: batch,
            });
        } catch (_error) {
            this.pendingBatch = batch.concat(this.pendingBatch);
        }
    }
}
