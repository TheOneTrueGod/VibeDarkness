import { describe, it, expect } from 'vitest';
import { PreviewEmissionBuffer } from './PreviewEmissionBuffer';

describe('PreviewEmissionBuffer', () => {
    it('creates a buffer with the given runId', () => {
        const buffer = new PreviewEmissionBuffer(42);
        expect(buffer.runId).toBe(42);
        expect(buffer.fingerprints).toEqual([]);
        expect(buffer.latestCheckpoint).toBeNull();
        expect(buffer.resolvedBatches).toEqual([]);
    });

    it('records fingerprints when runId matches', () => {
        const buffer = new PreviewEmissionBuffer(10);
        buffer.recordFingerprint(100, 'abcd', false, undefined, 10);
        buffer.recordFingerprint(101, 'efgh', true, 'some reason', 10);

        expect(buffer.fingerprints).toHaveLength(2);
        expect(buffer.fingerprints[0]).toEqual({ tick: 100, fp: 'abcd', paused: false, adminReason: undefined });
        expect(buffer.fingerprints[1]).toEqual({ tick: 101, fp: 'efgh', paused: true, adminReason: 'some reason' });
    });

    it('rejects fingerprint writes for mismatched runId', () => {
        const buffer = new PreviewEmissionBuffer(10);
        expect(() => buffer.recordFingerprint(100, 'abcd', false, undefined, 99)).toThrow(
            /runId mismatch.*buffer=10.*emission=99/
        );
    });

    it('records checkpoints, keeping only the latest', () => {
        const buffer = new PreviewEmissionBuffer(5);
        const state1 = { gameTick: 10, randomSeed: 123 } as any;
        const state2 = { gameTick: 20, randomSeed: 123 } as any;

        buffer.recordCheckpoint(10, state1, 5);
        expect(buffer.latestCheckpoint).toEqual({ tick: 10, state: state1 });

        buffer.recordCheckpoint(20, state2, 5);
        expect(buffer.latestCheckpoint).toEqual({ tick: 20, state: state2 });
        // Only one checkpoint stored, not accumulated
        expect(buffer.fingerprints).toHaveLength(0);
    });

    it('rejects checkpoint writes for mismatched runId', () => {
        const buffer = new PreviewEmissionBuffer(5);
        const state = { gameTick: 10, randomSeed: 123 } as any;
        expect(() => buffer.recordCheckpoint(10, state, 99)).toThrow(
            /runId mismatch.*buffer=5.*emission=99/
        );
    });

    it('records resolved batches', () => {
        const buffer = new PreviewEmissionBuffer(15);
        buffer.recordResolvedBatch(50, 15);
        buffer.recordResolvedBatch(60, 15);

        expect(buffer.resolvedBatches).toEqual([50, 60]);
    });

    it('rejects resolved batch writes for mismatched runId', () => {
        const buffer = new PreviewEmissionBuffer(15);
        expect(() => buffer.recordResolvedBatch(50, 99)).toThrow(
            /runId mismatch.*buffer=15.*emission=99/
        );
    });

    it('accumulates multiple emissions together', () => {
        const buffer = new PreviewEmissionBuffer(7);
        const state = { gameTick: 30, randomSeed: 456 } as any;

        buffer.recordFingerprint(100, 'fp1', false, undefined, 7);
        buffer.recordCheckpoint(101, state, 7);
        buffer.recordFingerprint(102, 'fp2', true, 'paused', 7);
        buffer.recordResolvedBatch(50, 7);
        buffer.recordResolvedBatch(60, 7);

        expect(buffer.fingerprints).toHaveLength(2);
        expect(buffer.latestCheckpoint?.tick).toBe(101);
        expect(buffer.resolvedBatches).toEqual([50, 60]);
    });
});
