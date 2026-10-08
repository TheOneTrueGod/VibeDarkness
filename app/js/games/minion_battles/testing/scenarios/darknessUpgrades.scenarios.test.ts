import { describe, expect, it } from 'vitest';
import { runScenarioHeadless } from '../runner/SimulationRunner';
import { empoweredSpiritsScenario } from './general/darknessUpgrades';

describe('Darkness Upgrades ability-test scenarios', () => {
    it('passes Empowered Spirits scenario', () => {
        const r = runScenarioHeadless(empoweredSpiritsScenario);
        expect(r.passed, r.message).toBe(true);
    });
});
