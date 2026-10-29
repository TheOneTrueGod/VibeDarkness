import { describe, expect, it } from 'vitest';
import { DEFAULT_HIT_STUN_SECONDS } from '../../time/timeConstants';
import {
    HIT_STUN_SHAKE_AMPLITUDE_PX,
    HIT_STUN_SHAKE_CYCLES,
    HIT_STUN_SHAKE_FREQUENCY_HZ,
    hitStunShakeOffset,
} from './hitStunShake';

const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';
const NOW_MS = 1_000;

describe('hitStunShakeOffset', () => {
    it('repeats for the same wall time and unit id', () => {
        expect(hitStunShakeOffset(NOW_MS, UNIT_A)).toEqual(hitStunShakeOffset(NOW_MS, UNIT_A));
    });

    it('can change when the unit id or the wall time changes', () => {
        const base = hitStunShakeOffset(NOW_MS, UNIT_A);
        const otherUnit = hitStunShakeOffset(NOW_MS, UNIT_B);
        const halfCycleMs = 500 / HIT_STUN_SHAKE_FREQUENCY_HZ;
        const later = hitStunShakeOffset(NOW_MS + halfCycleMs, UNIT_A);
        expect(otherUnit).not.toEqual(base);
        expect(later).not.toEqual(base);
    });

    it('stays within the amplitude and fits a few cycles in the default stun', () => {
        expect(HIT_STUN_SHAKE_FREQUENCY_HZ * DEFAULT_HIT_STUN_SECONDS).toBe(HIT_STUN_SHAKE_CYCLES);
        const ids = [UNIT_A, UNIT_B, 'caster'];
        const stepMs = 1000 / HIT_STUN_SHAKE_FREQUENCY_HZ / 8;
        for (const unitId of ids) {
            for (let step = 0; step < 24; step++) {
                const offset = hitStunShakeOffset(step * stepMs, unitId);
                const travel = Math.hypot(offset.x, offset.y);
                expect(travel).toBeLessThanOrEqual(HIT_STUN_SHAKE_AMPLITUDE_PX + 1e-9);
            }
        }
    });
});
