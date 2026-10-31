/**
 * Thin Vitest wiring for the Armory Core AbilityTests (plan `ability-themes-and-armory-engine`, Step 12).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { ARMORY_SCENARIOS } from './abilities/armoryScenarios';

describe('Armory ability-test scenarios', () => {
    for (const scenario of ARMORY_SCENARIOS) {
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
