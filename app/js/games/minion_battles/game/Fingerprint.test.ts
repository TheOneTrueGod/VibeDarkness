/**
 * Tests for the Fingerprint module: deterministic mix, hex round-trip, and
 * FingerprintRing wrap/eviction/range semantics.
 */
import { describe, it, expect } from 'vitest';
import {
    type Fingerprint64,
    FingerprintEvent,
    FingerprintRing,
    fingerprintEquals,
    fingerprintFromHex,
    fingerprintInitial,
    fingerprintToHex,
    mix,
} from './Fingerprint';

describe('FingerprintEvent enum-like object', () => {
    it('uses small distinct integer tags 1..8', () => {
        expect(FingerprintEvent.RNG).toBe(1);
        expect(FingerprintEvent.DAMAGE).toBe(2);
        expect(FingerprintEvent.DEATH).toBe(3);
        expect(FingerprintEvent.SPAWN).toBe(4);
        expect(FingerprintEvent.ORDER_APPLIED).toBe(5);
        expect(FingerprintEvent.PROJECTILE_HIT).toBe(6);
        expect(FingerprintEvent.EFFECT_TICK).toBe(7);
        expect(FingerprintEvent.TICK_END).toBe(8);

        const tags = Object.values(FingerprintEvent);
        expect(new Set(tags).size).toBe(tags.length);
    });
});

describe('fingerprintInitial', () => {
    it('returns the documented seed and is stable across calls', () => {
        const a = fingerprintInitial();
        const b = fingerprintInitial();
        expect(a).toEqual([0x9e3779b9, 0x85ebca77]);
        expect(fingerprintEquals(a, b)).toBe(true);
    });
});

describe('mix — deterministic event mixing', () => {
    it('produces identical outputs for identical input sequences', () => {
        const seed = fingerprintInitial();
        let a = seed;
        let b = seed;

        a = mix(a, FingerprintEvent.DAMAGE, 1234, 17, 99);
        a = mix(a, FingerprintEvent.DEATH, 1234);
        a = mix(a, FingerprintEvent.TICK_END, 42);

        b = mix(b, FingerprintEvent.DAMAGE, 1234, 17, 99);
        b = mix(b, FingerprintEvent.DEATH, 1234);
        b = mix(b, FingerprintEvent.TICK_END, 42);

        expect(fingerprintEquals(a, b)).toBe(true);
    });

    it('reordering payload values within a single mix call changes the fingerprint', () => {
        const seed = fingerprintInitial();
        const a = mix(seed, FingerprintEvent.DAMAGE, 1, 2, 3);
        const b = mix(seed, FingerprintEvent.DAMAGE, 3, 2, 1);
        expect(fingerprintEquals(a, b)).toBe(false);
    });

    it('reordering events across multiple mix calls changes the fingerprint', () => {
        const seed = fingerprintInitial();
        const a = mix(mix(seed, FingerprintEvent.DAMAGE, 5), FingerprintEvent.DEATH, 7);
        const b = mix(mix(seed, FingerprintEvent.DEATH, 7), FingerprintEvent.DAMAGE, 5);
        expect(fingerprintEquals(a, b)).toBe(false);
    });

    it('does not mutate the input fingerprint', () => {
        const seed = fingerprintInitial();
        const before: Fingerprint64 = [seed[0], seed[1]];
        const _next = mix(seed, FingerprintEvent.RNG, 0xdeadbeef);
        expect(seed[0]).toBe(before[0]);
        expect(seed[1]).toBe(before[1]);
    });

    it('mixing the tag alone (no payload) is deterministic and tag-sensitive', () => {
        const seed = fingerprintInitial();
        const a = mix(seed, FingerprintEvent.RNG);
        const b = mix(seed, FingerprintEvent.RNG);
        const c = mix(seed, FingerprintEvent.DAMAGE);
        expect(fingerprintEquals(a, b)).toBe(true);
        expect(fingerprintEquals(a, c)).toBe(false);
    });

    it('output halves stay within unsigned 32-bit range', () => {
        let fp = fingerprintInitial();
        for (let i = 0; i < 100; i++) {
            fp = mix(fp, FingerprintEvent.RNG, i, i * 7919, ~i);
            expect(fp[0]).toBeGreaterThanOrEqual(0);
            expect(fp[0]).toBeLessThanOrEqual(0xffffffff);
            expect(fp[1]).toBeGreaterThanOrEqual(0);
            expect(fp[1]).toBeLessThanOrEqual(0xffffffff);
            expect(Number.isInteger(fp[0])).toBe(true);
            expect(Number.isInteger(fp[1])).toBe(true);
        }
    });

    it('avalanches: flipping one input bit changes many output bits', () => {
        const seed = fingerprintInitial();
        const a = mix(seed, FingerprintEvent.DAMAGE, 0x00000000);
        const b = mix(seed, FingerprintEvent.DAMAGE, 0x00000001);
        const diff = ((a[0] ^ b[0]) >>> 0).toString(2).replace(/0/g, '').length
            + ((a[1] ^ b[1]) >>> 0).toString(2).replace(/0/g, '').length;
        // 64 bits total; a single input bit flip should disturb a substantial
        // fraction of output bits. Use a conservative lower bound to avoid
        // flakiness while still catching a degenerate (e.g. linear) mix.
        expect(diff).toBeGreaterThan(16);
    });
});

describe('fingerprintToHex / fingerprintFromHex', () => {
    it('round-trips exactly for a variety of values', () => {
        const cases: Fingerprint64[] = [
            [0x00000000, 0x00000000],
            [0xffffffff, 0xffffffff],
            [0x12345678, 0x9abcdef0],
            fingerprintInitial(),
            mix(fingerprintInitial(), FingerprintEvent.TICK_END, 42),
            mix(fingerprintInitial(), FingerprintEvent.DAMAGE, 0xdeadbeef, 0xcafebabe, 0),
        ];
        for (const fp of cases) {
            const hex = fingerprintToHex(fp);
            expect(hex).toHaveLength(16);
            expect(hex).toMatch(/^[0-9a-f]{16}$/);
            const back = fingerprintFromHex(hex);
            expect(fingerprintEquals(fp, back)).toBe(true);
        }
    });

    it('encodes hi half before lo half', () => {
        const hex = fingerprintToHex([0x12345678, 0x9abcdef0]);
        expect(hex).toBe('123456789abcdef0');
    });

    it('accepts mixed-case hex input', () => {
        const fp = fingerprintFromHex('AABBCCDD11223344');
        expect(fp[0]).toBe(0xaabbccdd);
        expect(fp[1]).toBe(0x11223344);
    });

    it('rejects malformed hex strings', () => {
        expect(() => fingerprintFromHex('')).toThrow();
        expect(() => fingerprintFromHex('123')).toThrow();
        expect(() => fingerprintFromHex('z'.repeat(16))).toThrow();
        expect(() => fingerprintFromHex('1'.repeat(15))).toThrow();
        expect(() => fingerprintFromHex('1'.repeat(17))).toThrow();
    });
});

describe('fingerprintEquals', () => {
    it('returns true only when both halves match', () => {
        expect(fingerprintEquals([1, 2], [1, 2])).toBe(true);
        expect(fingerprintEquals([1, 2], [1, 3])).toBe(false);
        expect(fingerprintEquals([1, 2], [2, 2])).toBe(false);
    });

    it('treats halves as unsigned 32-bit', () => {
        // Even if a caller hands us a negative number whose bit pattern matches
        // the unsigned half, equals should still report true after coercion.
        const signed = -1; // bit pattern 0xFFFFFFFF
        const unsigned = 0xffffffff;
        expect(fingerprintEquals([signed, signed], [unsigned, unsigned])).toBe(true);
    });
});

describe('FingerprintRing', () => {
    it('reports null/empty before any pushes', () => {
        const ring = new FingerprintRing(8);
        expect(ring.size()).toBe(0);
        expect(ring.getCapacity()).toBe(8);
        expect(ring.latest()).toBeNull();
        expect(ring.getAt(0)).toBeNull();
        expect(ring.range(0, 100)).toEqual([]);
    });

    it('rejects non-positive or non-integer capacities', () => {
        expect(() => new FingerprintRing(0)).toThrow();
        expect(() => new FingerprintRing(-1)).toThrow();
        expect(() => new FingerprintRing(1.5)).toThrow();
        expect(() => new FingerprintRing(NaN)).toThrow();
    });

    it('uses default capacity of 600', () => {
        const ring = new FingerprintRing();
        expect(ring.getCapacity()).toBe(600);
    });

    it('stores and retrieves entries before reaching capacity', () => {
        const ring = new FingerprintRing(4);
        for (let t = 1; t <= 3; t++) {
            ring.push(t, [t * 10, t * 100]);
        }
        expect(ring.size()).toBe(3);
        expect(ring.getAt(2)).toEqual([20, 200]);
        expect(ring.latest()).toEqual({ tick: 3, fp: [30, 300] });
        expect(ring.getAt(99)).toBeNull();
    });

    it('wraps and evicts the oldest entry when full', () => {
        const ring = new FingerprintRing(3);
        ring.push(1, [1, 1]);
        ring.push(2, [2, 2]);
        ring.push(3, [3, 3]);
        ring.push(4, [4, 4]); // evicts tick 1
        ring.push(5, [5, 5]); // evicts tick 2

        expect(ring.size()).toBe(3);
        expect(ring.getAt(1)).toBeNull();
        expect(ring.getAt(2)).toBeNull();
        expect(ring.getAt(3)).toEqual([3, 3]);
        expect(ring.getAt(4)).toEqual([4, 4]);
        expect(ring.getAt(5)).toEqual([5, 5]);
        expect(ring.latest()).toEqual({ tick: 5, fp: [5, 5] });
    });

    it('range returns inclusive bounds in oldest-to-newest order', () => {
        const ring = new FingerprintRing(10);
        for (let t = 1; t <= 6; t++) {
            ring.push(t, [t, t * 2]);
        }
        const got = ring.range(2, 5);
        expect(got.map((e) => e.tick)).toEqual([2, 3, 4, 5]);
        expect(got[0].fp).toEqual([2, 4]);
        expect(got[3].fp).toEqual([5, 10]);
    });

    it('range respects bounds outside stored data', () => {
        const ring = new FingerprintRing(5);
        ring.push(10, [1, 1]);
        ring.push(11, [2, 2]);
        ring.push(12, [3, 3]);

        expect(ring.range(0, 9)).toEqual([]);
        expect(ring.range(13, 20)).toEqual([]);
        expect(ring.range(11, 11)).toEqual([{ tick: 11, fp: [2, 2] }]);
        expect(ring.range(5, 11).map((e) => e.tick)).toEqual([10, 11]);
        expect(ring.range(5, 100).map((e) => e.tick)).toEqual([10, 11, 12]);
    });

    it('range returns empty when fromTick > toTick', () => {
        const ring = new FingerprintRing(5);
        ring.push(1, [1, 1]);
        ring.push(2, [2, 2]);
        expect(ring.range(5, 0)).toEqual([]);
    });

    it('range and getAt continue to work after wrap-around', () => {
        const ring = new FingerprintRing(3);
        // Push 5 entries into capacity-3 ring; only ticks 3,4,5 should remain.
        for (let t = 1; t <= 5; t++) {
            ring.push(t, [t, t]);
        }
        expect(ring.size()).toBe(3);
        expect(ring.range(0, 10).map((e) => e.tick)).toEqual([3, 4, 5]);
        expect(ring.getAt(3)).toEqual([3, 3]);
        expect(ring.getAt(2)).toBeNull();
    });

    it('latest reflects the most recent push even after eviction', () => {
        const ring = new FingerprintRing(2);
        ring.push(100, [1, 2]);
        expect(ring.latest()).toEqual({ tick: 100, fp: [1, 2] });
        ring.push(101, [3, 4]);
        expect(ring.latest()).toEqual({ tick: 101, fp: [3, 4] });
        ring.push(102, [5, 6]);
        expect(ring.latest()).toEqual({ tick: 102, fp: [5, 6] });
        expect(ring.size()).toBe(2);
        expect(ring.getAt(100)).toBeNull();
    });

    it('clear empties the ring without changing capacity', () => {
        const ring = new FingerprintRing(4);
        ring.push(1, [1, 1]);
        ring.push(2, [2, 2]);
        ring.clear();
        expect(ring.size()).toBe(0);
        expect(ring.latest()).toBeNull();
        expect(ring.getAt(1)).toBeNull();
        expect(ring.getCapacity()).toBe(4);
        ring.push(3, [3, 3]);
        expect(ring.latest()).toEqual({ tick: 3, fp: [3, 3] });
    });

    it('preserves unsigned half values when reading back', () => {
        const ring = new FingerprintRing(2);
        ring.push(1, [0xffffffff, 0xfffffffe]);
        const got = ring.getAt(1);
        expect(got).not.toBeNull();
        expect(got?.[0]).toBe(0xffffffff);
        expect(got?.[1]).toBe(0xfffffffe);
    });
});
