import { describe, expect, it } from 'vitest';
import { LIGHT_RADIANT_REACH_RANGE_MULT } from '../../../../../researchTrees/trees/light';
import {
    IMBUED_BAT_ABILITY_ID,
    LIGHT_CONE_MAX_RANGE,
    getImbuedBatLightConeMaxRange,
} from './0803Constants';

describe('Imbued Bat light cone range', () => {
    it('uses the base cone range with no modifier', () => {
        expect(getImbuedBatLightConeMaxRange()).toBe(LIGHT_CONE_MAX_RANGE);
    });

    it('multiplies cone range by rangeMult', () => {
        expect(getImbuedBatLightConeMaxRange({
            abilityModifiers: {
                [IMBUED_BAT_ABILITY_ID]: { rangeMult: LIGHT_RADIANT_REACH_RANGE_MULT },
            },
        })).toBe(LIGHT_CONE_MAX_RANGE * LIGHT_RADIANT_REACH_RANGE_MULT);
    });
});
