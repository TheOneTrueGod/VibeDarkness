import { describe, expect, it } from 'vitest';
import { getAllAbilities } from './AbilityRegistry';
import { isAbilityTimingInterval } from './abilityTimings';

describe('AbilityRegistry', () => {
    it('every registered ability has non-empty interval abilityTimings', () => {
        for (const a of getAllAbilities()) {
            const t = a.abilityTimings;
            expect(t.length, `${a.id} must define abilityTimings`).toBeGreaterThan(0);
            for (let i = 0; i < t.length; i++) {
                expect(
                    isAbilityTimingInterval(t[i]),
                    `${a.id} abilityTimings[${i}] must be AbilityTimingInterval`,
                ).toBe(true);
            }
        }
    });
});
