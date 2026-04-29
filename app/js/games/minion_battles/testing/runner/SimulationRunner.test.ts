import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from './SimulationRunner';
import { getScenarioById } from '../scenarios/registry';
import { pathShortCommuteScenario } from '../scenarios/general/pathfinding';
import { punchBaselineScenario } from '../scenarios/abilities/punchResearch';
import { swingSwordExtraUsesScenario } from '../scenarios/abilities/swingSwordResearch';

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

    it('getScenarioById returns registered scenario', () => {
        const s = getScenarioById('path_short_commute');
        expect(s?.id).toBe('path_short_commute');
    });
});
