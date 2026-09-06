import { describe, expect, it } from 'vitest';
import { BRIGHT_DEFS } from '../../../abilities/brightKeyword';
import { DEFAULT_LIGHT_TYPE } from '../../../game/lighting/lightTypes';
import { LIGHT_BLAST_BRIGHT_MAGNITUDE } from './0801Constants';

describe('Light Blast leftover light', () => {
    it('uses Bright 3 FireLight, stronger than the old DayLight amount of 1', () => {
        const def = BRIGHT_DEFS[LIGHT_BLAST_BRIGHT_MAGNITUDE];
        expect(def).toBeDefined();
        expect(def!.lightAmount).toBeGreaterThan(1);
        expect(DEFAULT_LIGHT_TYPE).toBe('FireLight');
    });
});
