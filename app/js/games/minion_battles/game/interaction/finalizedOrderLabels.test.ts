import { describe, expect, it } from 'vitest';
import { buildFinalizedSequentialTargetingOrder } from './InteractiveTargetingSession';
import type { BattleOrder, ResolvedTarget } from '../types';

const LABELS = ['Swipe left', 'Swipe right', 'X strike'] as const;
const baseOrder: BattleOrder = { unitId: 'caster', abilityId: '0306', targets: [] };

describe('buildFinalizedSequentialTargetingOrder targetsByLabel', () => {
    it('keeps each label on its own pick when several steps lock the same unit (lobby F2DDA5)', () => {
        // Same enemy locked by every strike, each strike with its own aim and lock-ons.
        const collected: Record<string, ResolvedTarget> = {
            'Swipe left': { type: 'unit', unitId: 'slime', lockRole: 'primary', stepAim: { x: 1, y: 1 } },
            'Swipe right': {
                type: 'unit', unitId: 'slime', lockRole: 'primary', stepAim: { x: 2, y: 2 }, stepLockOnUnitIds: ['bug'],
            },
            'X strike': { type: 'unit', unitId: 'slime', lockRole: 'primary', stepAim: { x: 3, y: 3 } },
        };

        const order = buildFinalizedSequentialTargetingOrder(LABELS, collected, baseOrder);

        expect(order.targetsByLabel?.['Swipe left']?.stepAim).toEqual({ x: 1, y: 1 });
        expect(order.targetsByLabel?.['Swipe right']?.stepAim).toEqual({ x: 2, y: 2 });
        expect(order.targetsByLabel?.['Swipe right']?.stepLockOnUnitIds).toEqual(['bug']);
        expect(order.targetsByLabel?.['X strike']?.stepAim).toEqual({ x: 3, y: 3 });
    });
});
