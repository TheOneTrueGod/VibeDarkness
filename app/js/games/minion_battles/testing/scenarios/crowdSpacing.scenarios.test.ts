/**
 * Thin Vitest wiring for the CrowdSpacing AbilityTest scenarios (legacy-pinned + mass-pinned).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { crowdSpacingPackAndAnchorsScenario } from './general/crowdSpacing';
import { CROWD_MASS_SCENARIOS } from './general/crowdSpacingMass';

describe('CrowdSpacing ability-test scenarios', () => {
    it('crowd_spacing_pack_and_anchors (legacy): soft pack spreads; anchors hold', () => {
        const r = runScenarioHeadless(crowdSpacingPackAndAnchorsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it.each(CROWD_MASS_SCENARIOS.map((s) => [s.id, s] as const))('%s (mass)', (_id, scenario) => {
        const r = runScenarioHeadless(scenario);
        expect(r.passed, r.message).toBe(true);
    });
});
