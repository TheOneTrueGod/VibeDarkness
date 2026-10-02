/**
 * PreviewEmissionBuffer — collects engine callbacks during an ITS preview run.
 *
 * During a preview timeline, checkpoint/tick-complete/batch-resolved callbacks
 * that would normally flush to the network are instead buffered here. On promotion,
 * the buffer is flushed in order (Step 5). On discard, the buffer is dropped.
 */

import type { SerializedGameState } from '../types';

export interface PreviewFingerprint {
    tick: number;
    fp: string;
    paused: boolean;
    adminReason: string | undefined;
}

export class PreviewEmissionBuffer {
    readonly runId: number;
    fingerprints: PreviewFingerprint[] = [];
    latestCheckpoint: { tick: number; state: SerializedGameState } | null = null;
    resolvedBatches: number[] = [];

    constructor(runId: number) {
        this.runId = runId;
    }

    /**
     * Record a fingerprint emission during preview.
     * Rejects writes for a different runId (defensive; should never happen if buffer is swapped correctly).
     */
    recordFingerprint(tick: number, fp: string, paused: boolean, adminReason: string | undefined, runId: number): void {
        if (runId !== this.runId) {
            throw new Error(
                `PreviewEmissionBuffer.recordFingerprint: runId mismatch ` +
                `(buffer=${this.runId}, emission=${runId}). Buffer/callback wiring error.`
            );
        }
        this.fingerprints.push({ tick, fp, paused, adminReason });
    }

    /**
     * Record a checkpoint emission during preview.
     * Keeps only the latest checkpoint (earlier preview pauses are superseded).
     * Rejects writes for a different runId.
     */
    recordCheckpoint(tick: number, state: SerializedGameState, runId: number): void {
        if (runId !== this.runId) {
            throw new Error(
                `PreviewEmissionBuffer.recordCheckpoint: runId mismatch ` +
                `(buffer=${this.runId}, emission=${runId}). Buffer/callback wiring error.`
            );
        }
        this.latestCheckpoint = { tick, state };
    }

    /**
     * Record a batch-resolved emission during preview.
     * Rejects writes for a different runId.
     */
    recordResolvedBatch(batchAtTick: number, runId: number): void {
        if (runId !== this.runId) {
            throw new Error(
                `PreviewEmissionBuffer.recordResolvedBatch: runId mismatch ` +
                `(buffer=${this.runId}, emission=${runId}). Buffer/callback wiring error.`
            );
        }
        this.resolvedBatches.push(batchAtTick);
    }
}
