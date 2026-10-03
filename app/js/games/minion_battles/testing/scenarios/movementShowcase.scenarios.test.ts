/**
 * Vitest wiring for the movement showcase AbilityTest scenarios (pathfinding overhaul).
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { MOVEMENT_SHOWCASE_SCENARIOS } from './general/movementShowcase';

describe('Movement showcase ability-test scenarios', () => {
    for (const scenario of MOVEMENT_SHOWCASE_SCENARIOS) {
        it(`${scenario.id}: ${scenario.title}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
