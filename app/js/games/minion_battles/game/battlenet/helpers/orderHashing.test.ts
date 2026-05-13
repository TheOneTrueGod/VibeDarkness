import { describe, it, expect } from 'vitest';
import type { BattleOrder } from '../../types';
import { hashOrderId, stableStringify } from './orderHashing';

function makeOrder(unitId: string, abilityId: string): BattleOrder {
    return { unitId, abilityId, targets: [] };
}

describe('stableStringify', () => {
    it('returns JSON.stringify for primitives and null', () => {
        expect(stableStringify(null)).toBe('null');
        expect(stableStringify(42)).toBe('42');
        expect(stableStringify('hi')).toBe('"hi"');
        expect(stableStringify(true)).toBe('true');
    });

    it('serializes object keys in sorted order regardless of insertion order', () => {
        const a = { b: 1, a: 2 };
        const b = { a: 2, b: 1 };
        expect(stableStringify(a)).toBe(stableStringify(b));
        expect(stableStringify(a)).toBe('{"a":2,"b":1}');
    });

    it('recursively serializes nested objects and arrays', () => {
        const value = { z: [3, { y: 1, x: 2 }], a: { c: 4, b: 5 } };
        expect(stableStringify(value)).toBe('{"a":{"b":5,"c":4},"z":[3,{"x":2,"y":1}]}');
    });
});

describe('hashOrderId', () => {
    it('produces a stable 8-character hex hash for the same inputs', () => {
        const order = makeOrder('u1', 'fireball');
        const h1 = hashOrderId('player-a', 5, order);
        const h2 = hashOrderId('player-a', 5, order);
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{8}$/);
    });

    it('produces different hashes for different playerIds', () => {
        const order = makeOrder('u1', 'fireball');
        expect(hashOrderId('a', 5, order)).not.toBe(hashOrderId('b', 5, order));
    });

    it('produces different hashes for different atTicks', () => {
        const order = makeOrder('u1', 'fireball');
        expect(hashOrderId('a', 5, order)).not.toBe(hashOrderId('a', 6, order));
    });

    it('produces different hashes for different orders', () => {
        expect(hashOrderId('a', 5, makeOrder('u1', 'fireball'))).not.toBe(
            hashOrderId('a', 5, makeOrder('u1', 'icebolt')),
        );
    });

    it('produces the same hash regardless of object key order in targets', () => {
        const orderA: BattleOrder = {
            unitId: 'u1',
            abilityId: 'fireball',
            targets: [{ kind: 'point', x: 5, y: 3 } as unknown as BattleOrder['targets'][number]],
        };
        const orderB: BattleOrder = {
            unitId: 'u1',
            abilityId: 'fireball',
            targets: [{ y: 3, x: 5, kind: 'point' } as unknown as BattleOrder['targets'][number]],
        };
        expect(hashOrderId('a', 5, orderA)).toBe(hashOrderId('a', 5, orderB));
    });
});
