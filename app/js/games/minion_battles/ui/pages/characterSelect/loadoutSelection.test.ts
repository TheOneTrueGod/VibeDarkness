import { describe, expect, it } from 'vitest';
import { isPrepDeckSelectorUnlocked } from './loadoutSelection';
import { PREP_ABILITY_SLOT_COUNT } from '../../../storylines/questPrepLoadout';

describe('isPrepDeckSelectorUnlocked', () => {
    it('is locked (renders nothing) until there are more abilities than prep slots', () => {
        expect(isPrepDeckSelectorUnlocked(0)).toBe(false);
        expect(isPrepDeckSelectorUnlocked(PREP_ABILITY_SLOT_COUNT)).toBe(false);
        expect(isPrepDeckSelectorUnlocked(PREP_ABILITY_SLOT_COUNT + 1)).toBe(true);
    });
});
