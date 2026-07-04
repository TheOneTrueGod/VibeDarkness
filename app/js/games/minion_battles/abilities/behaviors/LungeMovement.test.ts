import { describe, it, expect } from 'vitest';
import { computeLungeChargeDirection } from './LungeMovement';
import type { Unit } from '../../game/units/Unit';

function unitStub(overrides: Partial<Unit> & Pick<Unit, 'ownerId'>): Unit {
    return {
        moveJitter: 0,
        isPlayerControlled() {
            return this.ownerId !== 'ai';
        },
        ...overrides,
    } as Unit;
}

describe('computeLungeChargeDirection', () => {
    it('uses exact aim for player-controlled casters (no moveJitter offset)', () => {
        const caster = unitStub({ ownerId: 'player-1' });
        const { dirX, dirY } = computeLungeChargeDirection(caster, 0, 0, 100, 100);
        const expectedAngle = Math.atan2(100, 100);
        expect(Math.atan2(dirY, dirX)).toBeCloseTo(expectedAngle, 10);
    });

    it('applies moveJitter for AI casters', () => {
        const caster = unitStub({ ownerId: 'ai', moveJitter: 0.5 });
        const { dirX, dirY } = computeLungeChargeDirection(caster, 0, 0, 100, 0);
        const angle = Math.atan2(dirY, dirX);
        expect(angle).toBeCloseTo(0, 10);
    });

    it('applies -15° jitter when AI moveJitter is 0', () => {
        const caster = unitStub({ ownerId: 'ai', moveJitter: 0 });
        const { dirX, dirY } = computeLungeChargeDirection(caster, 0, 0, 100, 0);
        const angle = Math.atan2(dirY, dirX);
        expect(angle).toBeCloseTo(-Math.PI / 12, 10);
    });
});
