import { describe, expect, it } from 'vitest';
import {
    GATHER_LIGHT_ABILITY_ID,
    GATHER_LIGHT_AMOUNT,
    getGatherLightAmount,
} from './0804Constants';

describe('Gather Light amount', () => {
    it('starts at 1 Light with no research', () => {
        expect(GATHER_LIGHT_AMOUNT).toBe(1);
        expect(getGatherLightAmount()).toBe(GATHER_LIGHT_AMOUNT);
    });

    it('adds resourceGainFlat from ability modifiers', () => {
        expect(
            getGatherLightAmount({
                abilityModifiers: { [GATHER_LIGHT_ABILITY_ID]: { resourceGainFlat: 2 } },
            }),
        ).toBe(GATHER_LIGHT_AMOUNT + 2);
    });
});
