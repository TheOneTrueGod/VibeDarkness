import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from '../../runner/SimulationRunner';
import {
    earthCoreGatherStoneRockHarvestScenario,
    earthCoreGatherStoneRubbleStrikeScenario,
    earthCoreGatherStoneNoRubbleStrikeWithoutResearchScenario,
} from './earthCoreScenarios';

describe('Gather Stone (0536) scenarios', () => {
    it('banks 1 rock per cracked tile', () => {
        const result = runScenarioHeadless(earthCoreGatherStoneRockHarvestScenario);
        expect(result.passed, result.message).toBe(true);
    });

    it('Grinding Debris strikes an enemy on rubble for 6', () => {
        const result = runScenarioHeadless(earthCoreGatherStoneRubbleStrikeScenario);
        expect(result.passed, result.message).toBe(true);
    });

    it('leaves rubble-standing enemies unharmed without the research node', () => {
        const result = runScenarioHeadless(earthCoreGatherStoneNoRubbleStrikeWithoutResearchScenario);
        expect(result.passed, result.message).toBe(true);
    });
});
