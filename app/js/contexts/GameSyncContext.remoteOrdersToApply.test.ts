/**
 * Unit tests for {@link remoteOrdersToApply} (order filtering + appliedKeys dedupe).
 */
import { describe, it, expect } from 'vitest';
import {
    collectSerializedPendingOrderKeys,
    minimalPollCheckpointGameTick,
    remoteOrdersToApply,
} from './GameSyncContext';

function order(tick: number, unitId: string) {
    return { gameTick: tick, order: { unitId, abilityId: 'wait', targets: [] } };
}

describe('minimalPollCheckpointGameTick', () => {
    it('uses engine bucket only when parallel atTick is missing', () => {
        expect(minimalPollCheckpointGameTick(99, undefined, 10)).toBe(90);
        expect(minimalPollCheckpointGameTick(100, undefined, 10)).toBe(100);
    });

    it('uses max bucket when parallel batch is in the next checkpoint window', () => {
        expect(minimalPollCheckpointGameTick(99, 100, 10)).toBe(100);
        expect(minimalPollCheckpointGameTick(90, 100, 10)).toBe(100);
    });

    it('does not downgrade when parallel atTick stays in same window as engine', () => {
        expect(minimalPollCheckpointGameTick(95, 99, 10)).toBe(90);
        expect(minimalPollCheckpointGameTick(100, 104, 10)).toBe(100);
    });
});

describe('collectSerializedPendingOrderKeys', () => {
    it('omits parallel-batch waiter tick+unit pairs so minimal poll can replay them', () => {
        const state = {
            gameTick: 19,
            waitingForOrders: {
                waiters: [
                    { unitId: 'unit_a', ownerId: 'p1' },
                    { unitId: 'unit_b', ownerId: 'p2' },
                ],
                atTick: 20,
            },
            orders: [
                { gameTick: 5, order: { unitId: 'enemy', abilityId: 'wait', targets: [] } },
                { gameTick: 20, order: { unitId: 'unit_a', abilityId: 'wait', targets: [] } },
            ],
        };
        const keys = collectSerializedPendingOrderKeys(state);
        expect(keys.has('20:unit_a')).toBe(false);
        expect(keys.has('20:unit_b')).toBe(false);
        expect(keys.has('5:enemy')).toBe(true);
    });
});

describe('remoteOrdersToApply', () => {
    it('drops orders whose tick+unitId appear in appliedKeys', () => {
        const appliedKeys = new Set<string>(['42:unit_b']);
        const state = {
            units: [
                { id: 'unit_a', ownerId: 'p1' },
                { id: 'unit_b', ownerId: 'p2' },
            ],
        };
        const serverOrders = [order(42, 'unit_a'), order(42, 'unit_b'), order(43, 'unit_b')];
        const pending = remoteOrdersToApply(serverOrders, 40, null, {
            localPlayerId: 'p1',
            state,
            appliedKeys,
        });
        const keys = pending.map((o) => `${o.gameTick}:${(o.order as { unitId: string }).unitId}`);
        expect(keys).toEqual(['42:unit_a', '43:unit_b']);
    });

    it('still includes future-tick orders even when other keys are applied', () => {
        const appliedKeys = new Set<string>(['10:u1']);
        const state = { units: [{ id: 'u1', ownerId: 'p1' }] };
        const pending = remoteOrdersToApply([order(20, 'u1')], 5, null, {
            localPlayerId: 'p1',
            state,
            appliedKeys,
        });
        expect(pending).toHaveLength(1);
        expect(pending[0].gameTick).toBe(20);
    });

    it('with opts null, ignores appliedKeys (only tick / waiting rules)', () => {
        const serverOrders = [order(5, 'x')];
        const pending = remoteOrdersToApply(serverOrders, 5, ['x'], null);
        expect(pending).toHaveLength(1);
    });

    it('includes current-tick orders for any listed waiting unit id', () => {
        const state = {
            units: [
                { id: 'unit_a', ownerId: 'p1' },
                { id: 'unit_b', ownerId: 'p1' },
            ],
        };
        const serverOrders = [order(10, 'unit_a'), order(10, 'unit_b')];
        const pending = remoteOrdersToApply(serverOrders, 10, ['unit_a', 'unit_b'], {
            localPlayerId: 'p1',
            state,
            appliedKeys: new Set(),
        });
        expect(pending.map((o) => (o.order as { unitId: string }).unitId).sort()).toEqual(['unit_a', 'unit_b']);
    });

    it('includes same-tick server order when unit is missing from state (owner lookup null)', () => {
        const state = { units: [{ id: 'unit_a', ownerId: 'p1' }] };
        const serverOrders = [order(10, 'unit_missing')];
        const pending = remoteOrdersToApply(serverOrders, 10, ['unit_a'], {
            localPlayerId: 'p1',
            state,
            appliedKeys: new Set(),
        });
        expect(pending).toHaveLength(1);
        expect((pending[0]!.order as { unitId: string }).unitId).toBe('unit_missing');
    });

    it('drops server order when same tick+unit is already in serialized engine orders', () => {
        const state = {
            units: [{ id: 'u1', ownerId: 'p1' }],
            orders: [{ gameTick: 20, order: { unitId: 'u1', abilityId: 'wait', targets: [] } }],
        };
        const pending = remoteOrdersToApply([order(20, 'u1')], 20, null, {
            localPlayerId: 'p1',
            state,
            appliedKeys: new Set(),
            localPendingOrderKeys: new Set(['20:u1']),
        });
        expect(pending).toHaveLength(0);
    });
});
