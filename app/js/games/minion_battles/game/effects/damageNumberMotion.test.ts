import { describe, it, expect } from 'vitest';
import {
    easeOutPow,
    damageNumberAsymmetricLift,
    computeDamageNumberWorldPosition,
    buildDamageNumberMotionFields,
    DAMAGE_NUMBER_PATH_INTRINSIC_END,
    DAMAGE_NUMBER_SPATIAL_GAIN,
} from './damageNumberMotion';

describe('damageNumberMotion', () => {
    it('easeOutPow starts faster than linear near t=0', () => {
        const t = 0.12;
        expect(easeOutPow(t, 1.88)).toBeGreaterThan(t);
    });

    it('asymmetric lift peaks before t=1', () => {
        const peak = 40;
        const atRiseEnd = damageNumberAsymmetricLift(0.72, peak);
        expect(atRiseEnd).toBeCloseTo(peak, 5);
        expect(damageNumberAsymmetricLift(1, peak)).toBeCloseTo(0, 5);
    });

    it('buildDamageNumberMotionFields uses incoming direction when from is set', () => {
        const rng = (_a: number, _b: number) => 0;
        const m = buildDamageNumberMotionFields(100, 100, rng, { x: 0, y: 100 });
        const len = Math.hypot(m.dirX, m.dirY);
        expect(len).toBeCloseTo(1, 5);
        expect(m.dirX).toBeGreaterThan(0.9);
        expect(Math.abs(m.dirY)).toBeLessThan(0.2);
    });

    it('truncates intrinsic path so p=1 is before full fall (still some lift)', () => {
        const data = {
            amount: 5,
            color: 0xff0000,
            originX: 50,
            originY: 50,
            dirX: 0,
            dirY: -1,
            flightPx: 40,
            arcPx: 30,
        };
        const end = computeDamageNumberWorldPosition(data, 1);
        expect(end.x).toBeCloseTo(50, 3);
        const tauEnd = DAMAGE_NUMBER_PATH_INTRINSIC_END;
        const liftAtEnd = damageNumberAsymmetricLift(tauEnd, 30 * DAMAGE_NUMBER_SPATIAL_GAIN);
        expect(liftAtEnd).toBeGreaterThan(4);
        expect(end.y).toBeLessThan(50);
    });
});
