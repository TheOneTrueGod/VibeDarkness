/**
 * Thin Vitest wiring for pathfinding / Movement AbilityTest scenarios
 * (pathfinding-overhaul Step 11; headless run in final verify).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import {
    pathOpenFieldStraightScenario,
    pathCornerNoBacktrackScenario,
    dodgeIFrameProtectionScenario,
    dodgeIFrameVsThornbinderScenario,
    pathGroupSpreadsScenario,
    pathChokePointSlideScenario,
    pathTerrainChangeRerouteScenario,
    pathStress200Scenario,
} from './general/pathfinding';

describe('Pathfinding / Movement ability-test scenarios', () => {
    it('path_open_field_straight: enemy pathfinding stays close to straight line', () => {
        const r = runScenarioHeadless(pathOpenFieldStraightScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('path_corner_no_backtrack: enemy pathfinding does not backtrack around corner', () => {
        const r = runScenarioHeadless(pathCornerNoBacktrackScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('dodge_iframe_protection: iframes block wolf charge and slime projectile', () => {
        const r = runScenarioHeadless(dodgeIFrameProtectionScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('dodge_iframe_vs_thornbinder: iframes block Thornbinder Bramble impact', () => {
        const r = runScenarioHeadless(dodgeIFrameVsThornbinderScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('path_group_spreads: 12 units spread across lanes at a corner', () => {
        const r = runScenarioHeadless(pathGroupSpreadsScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('path_chokepoint_slide: units queue and slide through a one-cell gap', () => {
        const r = runScenarioHeadless(pathChokePointSlideScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('path_terrain_change_reroute: units reroute when blocked, shortcut when reopened', () => {
        const r = runScenarioHeadless(pathTerrainChangeRerouteScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('path_stress_200: 200 units navigate obstacles efficiently', () => {
        const start = performance.now();
        const r = runScenarioHeadless(pathStress200Scenario);
        const elapsed = performance.now() - start;
        console.log(`path_stress_200 wall-clock time: ${elapsed.toFixed(0)}ms`);
        expect(r.passed, r.message).toBe(true);
    });
});
