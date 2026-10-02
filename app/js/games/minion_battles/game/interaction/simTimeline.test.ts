/**
 * Tests for SimTimeline state transitions.
 * Covers legal and illegal transitions (canonical→preview, preview→canonical, etc.).
 */

import { describe, it, expect } from 'vitest';
import {
    type SimTimeline,
    enterPreview,
    toCanonical,
    bumpEpoch,
} from './simTimeline';

describe('SimTimeline', () => {
    it('canonical timeline has kind and epoch', () => {
        const t: SimTimeline = { kind: 'canonical', engineEpoch: 0 };
        expect(t.kind).toBe('canonical');
        expect(t.engineEpoch).toBe(0);
    });

    it('preview timeline has kind, runId, epoch, markTick, batchAtTick', () => {
        const t: SimTimeline = {
            kind: 'preview',
            runId: 42,
            engineEpoch: 0,
            markTick: 100,
            batchAtTick: 110,
        };
        expect(t.kind).toBe('preview');
        expect(t.runId).toBe(42);
        expect(t.engineEpoch).toBe(0);
        expect(t.markTick).toBe(100);
        expect(t.batchAtTick).toBe(110);
    });

    describe('enterPreview', () => {
        it('canonical→preview is legal', () => {
            const canonical: SimTimeline = { kind: 'canonical', engineEpoch: 5 };
            const preview = enterPreview(canonical, {
                runId: 1,
                markTick: 50,
                batchAtTick: 60,
            });
            expect(preview.kind).toBe('preview');
            expect(preview.runId).toBe(1);
            expect(preview.engineEpoch).toBe(5);
            expect(preview.markTick).toBe(50);
            expect(preview.batchAtTick).toBe(60);
        });

        it('preview→preview throws (cannot nest)', () => {
            const preview: SimTimeline = {
                kind: 'preview',
                runId: 1,
                engineEpoch: 0,
                markTick: 50,
                batchAtTick: 60,
            };
            expect(() =>
                enterPreview(preview, { runId: 2, markTick: 60, batchAtTick: 70 }),
            ).toThrow(/already in preview/);
        });
    });

    describe('toCanonical', () => {
        it('preview→canonical is legal (promotion)', () => {
            const preview: SimTimeline = {
                kind: 'preview',
                runId: 42,
                engineEpoch: 3,
                markTick: 100,
                batchAtTick: 110,
            };
            const canonical = toCanonical(preview);
            expect(canonical.kind).toBe('canonical');
            expect(canonical.engineEpoch).toBe(3);
        });

        it('canonical→canonical throws (cannot re-promote)', () => {
            const canonical: SimTimeline = { kind: 'canonical', engineEpoch: 1 };
            expect(() => toCanonical(canonical)).toThrow(/already canonical/);
        });
    });

    describe('bumpEpoch', () => {
        it('increments epoch on canonical', () => {
            const t1: SimTimeline = { kind: 'canonical', engineEpoch: 5 };
            const t2 = bumpEpoch(t1);
            expect(t2.kind).toBe('canonical');
            expect(t2.engineEpoch).toBe(6);
        });

        it('increments epoch on preview', () => {
            const t1: SimTimeline = {
                kind: 'preview',
                runId: 1,
                engineEpoch: 3,
                markTick: 50,
                batchAtTick: 60,
            };
            const t2 = bumpEpoch(t1);
            expect(t2.kind).toBe('preview');
            if (t2.kind === 'preview') {
                expect(t2.runId).toBe(1);
                expect(t2.markTick).toBe(50);
                expect(t2.batchAtTick).toBe(60);
            }
            expect(t2.engineEpoch).toBe(4);
        });
    });

    describe('legal transition chains', () => {
        it('canonical→preview→canonical works', () => {
            let t: SimTimeline = { kind: 'canonical', engineEpoch: 0 };
            t = enterPreview(t, { runId: 1, markTick: 50, batchAtTick: 60 });
            expect(t.kind).toBe('preview');
            t = toCanonical(t);
            expect(t.kind).toBe('canonical');
            expect(t.engineEpoch).toBe(0);
        });

        it('canonical→preview→canonical→preview works (multiple cycles)', () => {
            let t: SimTimeline = { kind: 'canonical', engineEpoch: 0 };
            for (let i = 0; i < 3; i++) {
                t = enterPreview(t, { runId: i + 1, markTick: 50 + i, batchAtTick: 60 + i });
                expect(t.kind).toBe('preview');
                t = toCanonical(t);
                expect(t.kind).toBe('canonical');
            }
        });

        it('epoch bumps survive transitions', () => {
            let t: SimTimeline = { kind: 'canonical', engineEpoch: 0 };
            t = bumpEpoch(t);
            expect(t.engineEpoch).toBe(1);
            t = enterPreview(t, { runId: 1, markTick: 50, batchAtTick: 60 });
            expect(t.engineEpoch).toBe(1);
            t = toCanonical(t);
            expect(t.engineEpoch).toBe(1);
        });
    });
});
