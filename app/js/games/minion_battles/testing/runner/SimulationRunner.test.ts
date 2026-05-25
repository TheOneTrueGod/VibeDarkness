import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from './SimulationRunner';
import { getScenarioById } from '../scenarios/registry';
import { pathShortCommuteScenario } from '../scenarios/general/pathfinding';
import { punchBaselineScenario } from '../scenarios/abilities/punchResearch';
import { swingSwordExtraUsesScenario } from '../scenarios/abilities/swingSwordResearch';
import { absorptionShieldEnergyChargeScenario } from '../scenarios/abilities/absorptionShieldScenario';
import { lanterniteNestBuildScenario, lanterniteDefenderAttackScenario } from '../scenarios/general/lanternites';

describe('runScenarioHeadless', () => {
    it('passes short pathfinding commute', () => {
        const r = runScenarioHeadless(pathShortCommuteScenario);
        expect(r.passed).toBe(true);
        expect(r.ticks).toBeGreaterThan(0);
    });

    it('passes punch baseline damage scenario', () => {
        const r = runScenarioHeadless(punchBaselineScenario);
        expect(r.passed).toBe(true);
    });

    it('passes swing sword extra uses research scenario', () => {
        const r = runScenarioHeadless(swingSwordExtraUsesScenario);
        expect(r.passed).toBe(true);
    });

    it('passes absorption shield energy charge on block scenario', () => {
        const r = runScenarioHeadless(absorptionShieldEnergyChargeScenario);
        expect(r.passed, r.failureMessage ?? '').toBe(true);
    });

    it('getScenarioById returns registered scenario', () => {
        const s = getScenarioById('path_short_commute');
        expect(s?.id).toBe('path_short_commute');
    });

    it('passes lanternite light-pulse attack scenario', () => {
        const r = runScenarioHeadless(lanterniteDefenderAttackScenario);
        expect(r.passed, r.message).toBe(true);
    });

    it('passes lanternite nest build scenario', () => {
        const r = runScenarioHeadless(lanterniteNestBuildScenario);
        expect(r.passed, r.message).toBe(true);
    });
});
