import { describe, it, expect } from 'vitest';
import { resolvePlayerTileIndicatorColor } from './playerTileIndicator';
import type { GhostPlanData } from '../../game/types';

const BATCH = {
    atTick: 10,
    waiters: [{ unitId: 'unit_p2', ownerId: 'p2' }],
};

const GHOST: GhostPlanData = {
    unitId: 'unit_p2',
    abilityId: '0120',
    currentTargets: [],
    mouseWorld: { x: 0, y: 0 },
};

describe('resolvePlayerTileIndicatorColor', () => {
    it('green when player is not in the waiter list', () => {
        expect(
            resolvePlayerTileIndicatorColor('p1', { waitingForOrders: BATCH, pendingOrders: [] }, null),
        ).toBe('green');
    });

    it('red when waiting and no order submitted', () => {
        expect(
            resolvePlayerTileIndicatorColor('p2', { waitingForOrders: BATCH, pendingOrders: [] }, null),
        ).toBe('red');
    });

    it('green when waiting but finalized order exists', () => {
        expect(
            resolvePlayerTileIndicatorColor(
                'p2',
                {
                    waitingForOrders: BATCH,
                    pendingOrders: [{
                        gameTick: 10,
                        order: { unitId: 'unit_p2', abilityId: 'wait', targets: [], endTurn: true },
                    }],
                },
                null,
            ),
        ).toBe('green');
    });

    it('blue when waiting with non-finalized pending order', () => {
        expect(
            resolvePlayerTileIndicatorColor(
                'p2',
                {
                    waitingForOrders: BATCH,
                    pendingOrders: [{
                        gameTick: 10,
                        order: { unitId: 'unit_p2', abilityId: '0120', targets: [], endTurn: false },
                    }],
                },
                null,
            ),
        ).toBe('blue');
    });

    it('blue when ghost plan is present', () => {
        expect(
            resolvePlayerTileIndicatorColor('p2', { waitingForOrders: BATCH, pendingOrders: [] }, GHOST),
        ).toBe('blue');
    });
});
