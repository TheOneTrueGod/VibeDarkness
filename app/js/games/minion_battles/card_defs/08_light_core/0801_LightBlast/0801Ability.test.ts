import { describe, expect, it } from 'vitest';
import { BRIGHT_DEFS } from '../../../abilities/brightKeyword';
import { DEFAULT_LIGHT_TYPE } from '../../../game/lighting/lightTypes';
import {
    LIGHT_BLAST_ABILITY_ID,
    LIGHT_BLAST_BRIGHT_MAGNITUDE,
    LIGHT_BLAST_RADIUS,
    getLightBlastRadius,
} from './0801Constants';
import { LIGHT_INCREASED_RADIANCE_RANGE_MULT } from '../../../../../researchTrees/trees/light';

describe('Light Blast leftover light', () => {
    it('uses Bright 3 FireLight, stronger than the old DayLight amount of 1', () => {
        const def = BRIGHT_DEFS[LIGHT_BLAST_BRIGHT_MAGNITUDE];
        expect(def).toBeDefined();
        expect(def!.lightAmount).toBeGreaterThan(1);
        expect(DEFAULT_LIGHT_TYPE).toBe('FireLight');
    });
});

describe('Light Blast radius', () => {
    it('uses the base radius with no research', () => {
        expect(getLightBlastRadius()).toBe(LIGHT_BLAST_RADIUS);
    });

    it('multiplies radius by rangeMult', () => {
        expect(
            getLightBlastRadius({
                abilityModifiers: { [LIGHT_BLAST_ABILITY_ID]: { rangeMult: LIGHT_INCREASED_RADIANCE_RANGE_MULT } },
            }),
        ).toBe(LIGHT_BLAST_RADIUS * LIGHT_INCREASED_RADIANCE_RANGE_MULT);
    });
});
