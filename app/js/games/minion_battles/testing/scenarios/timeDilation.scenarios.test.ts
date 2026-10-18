/**
 * Thin Vitest wiring for the Time Dilation AbilityTest section (plan Step 12).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { TIME_DILATION_SCENARIOS } from './general/timeDilation';

describe('Time Dilation ability-test scenarios', () => {
    for (const scenario of TIME_DILATION_SCENARIOS) {
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
