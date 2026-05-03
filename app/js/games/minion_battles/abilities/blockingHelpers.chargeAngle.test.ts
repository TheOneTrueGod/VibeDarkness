import { describe, it, expect } from 'vitest';
import { canAttackBeBlocked } from './blockingHelpers';
import type { Unit } from '../game/units/Unit';

/** Minimal unit shape for blockingHelpers (only fields used by getBlockingArc path). */
function unitWithRaiseShieldFacingWest(activeStartTime: number): Unit {
    return {
        x: 0,
        y: 0,
        activeAbilities: [
            {
                abilityId: '0104',
                startTime: activeStartTime,
                targets: [{ type: 'pixel', position: { x: -200, y: 0 } }],
            },
        ],
    } as unknown as Unit;
}

describe('directional block vs charge-style attack source', () => {
    it('does not block when attack is declared from the wrong side (centroid past defender)', () => {
        const u = unitWithRaiseShieldFacingWest(0);
        // Attacker east of defender: angle 0; shield faces west (π) — outside block arc.
        expect(canAttackBeBlocked(u, 80, 0, 0.5)).toBe(false);
    });

    it('blocks when attack source lies in the shielded direction (west)', () => {
        const u = unitWithRaiseShieldFacingWest(0);
        expect(canAttackBeBlocked(u, -80, 0, 0.5)).toBe(true);
    });
});
