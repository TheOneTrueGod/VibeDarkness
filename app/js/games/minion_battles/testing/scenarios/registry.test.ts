import { describe, expect, it } from 'vitest';
import { ALL_ABILITY_TEST_SCENARIOS, getScenarioById } from './registry';

describe('ALL_ABILITY_TEST_SCENARIOS registry', () => {
    it('getScenarioById returns registered path_short_commute scenario', () => {
        const s = getScenarioById('path_short_commute');
        expect(s?.id).toBe('path_short_commute');
    });

    it('every scenario id is unique and non-empty', () => {
        const ids = ALL_ABILITY_TEST_SCENARIOS.map((s) => s.id);
        expect(ids.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
