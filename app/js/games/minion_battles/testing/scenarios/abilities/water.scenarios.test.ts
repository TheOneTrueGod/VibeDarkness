/**
 * Headless AbilityTests for the Water / Blood Mage overlap.
 * Burst is included here because it had no other headless wiring; Bloody Claws and Blood Shard
 * already run from SimulationRunner.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../../runner/SimulationRunner';
import { burstScenario } from './burstScenario';
import { WATER_SCENARIOS } from './waterScenarios';

describe('Water ability-test scenarios', () => {
    for (const scenario of [...WATER_SCENARIOS, burstScenario]) {
        it(`passes ${scenario.id}`, () => {
            const r = runScenarioHeadless(scenario);
            expect(r.passed, r.message).toBe(true);
        });
    }
});
