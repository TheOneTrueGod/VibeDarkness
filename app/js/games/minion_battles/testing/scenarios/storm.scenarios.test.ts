/**
 * Thin Vitest wiring for the Storm Core AbilityTest (`abilities/stormScenarios.ts`).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { STORM_SCENARIOS } from './abilities/stormScenarios';

describe('Storm ability-test scenarios', () => {
    for (const scenario of STORM_SCENARIOS) {
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
