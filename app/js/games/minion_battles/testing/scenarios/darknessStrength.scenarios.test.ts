/**
 * Thin Vitest wiring for DarknessStrength AbilityTest scenarios (Step 8).
 * Full AbilityTest UI / broader headless suite remains Step 9.
 */
import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import {
    dsEnemyHardenedRaisesEnemyHpScenario,
    dsSwarmReinforcementsOverRoundsScenario,
} from './general/darknessStrength';

describe('DarknessStrength ability-test scenarios', () => {
    it('passes hardened enemy max-HP scenario', () => {
        const r = runScenarioHeadless(dsEnemyHardenedRaisesEnemyHpScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes swarm reinforcements over rounds scenario', () => {
        const r = runScenarioHeadless(dsSwarmReinforcementsOverRoundsScenario);
        expect(r.passed, r.message).toBe(true);
    });
});
