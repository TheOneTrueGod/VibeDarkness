import { describe, it, expect } from 'vitest';
import { runScenarioHeadless } from '../../runner/SimulationRunner';
import { rapidThrowComboScenario } from './rapidThrowComboScenario';

describe('rapidThrowComboScenario', () => {
    it('passes headless', () => {
        const result = runScenarioHeadless(rapidThrowComboScenario);
        expect(result.passed, result.failureMessage).toBe(true);
    });
});
