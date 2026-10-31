import { describe, expect, it } from 'vitest';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import { Charge, CHARGE_MAX, CHARGE_MISSION_START, CHARGE_PER_ROUND } from './Charge';

function engineAtRound(roundNumber: number): EngineContext {
    return { roundNumber } as EngineContext;
}

describe('Charge', () => {
    it('does not recover on round 1, then recovers and clamps', () => {
        const charge = new Charge();
        charge.add(CHARGE_MISSION_START);
        charge.onRoundStart({} as Unit, engineAtRound(1));
        expect(charge.current).toBe(CHARGE_MISSION_START);

        charge.onRoundStart({} as Unit, engineAtRound(2));
        expect(charge.current).toBe(CHARGE_MISSION_START + CHARGE_PER_ROUND);
        expect(charge.current).toBe(CHARGE_MAX);

        charge.onRoundStart({} as Unit, engineAtRound(3));
        expect(charge.current).toBe(CHARGE_MAX);
    });
});
