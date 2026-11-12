import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from './SimulationRunner';
import { ALL_ABILITY_TEST_SCENARIOS } from '../scenarios/registry';

/**
 * Covered by `exposedDurationExtension.test.ts`, which vi.mocks
 * `EXPOSED_DURATION_INCREASES_FROM_CC` to true. Unmocked, the scenario cannot pass while the
 * flag is false in production — keep it in the registry for the Ability Test page only.
 */
const HEADLESS_SKIP_IDS = new Set(['exposed_duration_extension']);

describe('runScenarioHeadless', () => {
    for (const scenario of ALL_ABILITY_TEST_SCENARIOS) {
        if (HEADLESS_SKIP_IDS.has(scenario.id)) continue;
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
