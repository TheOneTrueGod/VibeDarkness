import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { HUNGER_SCENARIOS } from './general/hunger';

describe('Hunger ability-test scenarios', () => {
    for (const scenario of HUNGER_SCENARIOS) {
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
