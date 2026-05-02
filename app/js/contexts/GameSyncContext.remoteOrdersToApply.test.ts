/**
 * Unit tests for {@link remoteOrdersToApply} (order filtering + appliedKeys dedupe).
 */
import { describe, it, expect } from 'vitest';
import { remoteOrdersToApply } from './GameSyncContext';

function order(tick: number, unitId: string) {
    return { gameTick: tick, order: { unitId, abilityId: 'wait', targets: [] } };
}

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
});
