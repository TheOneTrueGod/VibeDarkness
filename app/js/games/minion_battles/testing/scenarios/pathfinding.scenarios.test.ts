/**
 * Thin Vitest wiring for pathfinding / Movement AbilityTest scenarios
 * (combat-iframe plan Step 5; headless run in final verify).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import {
    dodgeIFrameProtectionScenario,
    dodgeIFrameVsThornbinderScenario,
} from './general/pathfinding';

describe('Pathfinding / Movement ability-test scenarios', () => {
    it('dodge_iframe_protection: iframes block wolf charge and slime projectile', () => {
        const r = runScenarioHeadless(dodgeIFrameProtectionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('dodge_iframe_vs_thornbinder: iframes block Thornbinder Bramble impact', () => {
        const r = runScenarioHeadless(dodgeIFrameVsThornbinderScenario);
        expect(r.passed, r.message).toBe(true);
    });
});
