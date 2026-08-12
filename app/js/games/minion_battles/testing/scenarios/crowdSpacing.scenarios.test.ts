/**
 * Thin Vitest wiring for CrowdSpacing AbilityTest scenario (MVP Step 6 final verify).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { crowdSpacingPackAndAnchorsScenario } from './general/crowdSpacing';

describe('CrowdSpacing ability-test scenarios', () => {
    it('crowd_spacing_pack_and_anchors: soft pack spreads; anchors hold', () => {
        const r = runScenarioHeadless(crowdSpacingPackAndAnchorsScenario);
        expect(r.passed, r.message).toBe(true);
    });
});
