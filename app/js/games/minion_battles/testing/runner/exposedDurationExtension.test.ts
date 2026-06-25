/**
 * Isolated test for the exposed-duration-extension mechanic.
 *
 * EXPOSED_DURATION_INCREASES_FROM_CC is globally false while the boss fight is
 * being tuned, but the underlying logic must still work correctly.  We override
 * that flag here (and only here) so the test verifies the behaviour without
 * enabling it for every other test in the suite.
 */
import { vi, it, expect } from 'vitest';

vi.mock('../../crowdControl/ccConstants', async (importOriginal) => {
    const original = await importOriginal<typeof import('../../crowdControl/ccConstants')>();
    return { ...original, EXPOSED_DURATION_INCREASES_FROM_CC: true };
});

import { runScenarioHeadless } from './SimulationRunner';
import { exposedDurationExtensionScenario } from '../scenarios/general/enemies';

it('passes exposed duration extension scenario (absorbed stuns extend the exposed window)', () => {
    const r = runScenarioHeadless(exposedDurationExtensionScenario);
    expect(r.passed, r.message).toBe(true);
});
