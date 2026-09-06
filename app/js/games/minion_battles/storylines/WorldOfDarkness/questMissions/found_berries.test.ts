import { describe, expect, it } from 'vitest';
import {
    FOUND_BERRIES,
    FOUND_BERRIES_CHOICE_ID,
    FOUND_BERRIES_EAT_LABEL,
    FOUND_BERRIES_KEEP_LABEL,
    FOUND_BERRIES_OPTION_EAT,
    FOUND_BERRIES_OPTION_KEEP,
} from './found_berries';
import {
    FOUND_BERRIES_KEEP_FOOD,
    SEARCH_FOR_LOOSE_METALS_LABEL,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_HARVEST_METAL,
} from './questMissionConstants';

function foundBerriesChoiceOptions() {
    const phrase = FOUND_BERRIES.postMissionStory?.phrases.find((p) => p.type === 'choice');
    expect(phrase?.type).toBe('choice');
    if (phrase?.type !== 'choice') throw new Error('expected choice phrase');
    expect(phrase.choiceId).toBe(FOUND_BERRIES_CHOICE_ID);
    return phrase.options;
}

describe('Found Berries choices', () => {
    it('offers eat, keep, and Search for loose metals', () => {
        const options = foundBerriesChoiceOptions();
        expect(options.map((o) => o.id)).toEqual([
            FOUND_BERRIES_OPTION_EAT,
            FOUND_BERRIES_OPTION_KEEP,
            SEARCH_FOR_LOOSE_METALS_OPTION_ID,
        ]);
        expect(options.map((o) => o.label)).toEqual([
            FOUND_BERRIES_EAT_LABEL,
            FOUND_BERRIES_KEEP_LABEL,
            SEARCH_FOR_LOOSE_METALS_LABEL,
        ]);
    });

    it('grants keep-food and harvest-metal Campaign Rewards', () => {
        const options = foundBerriesChoiceOptions();
        const keep = options.find((o) => o.id === FOUND_BERRIES_OPTION_KEEP);
        const metals = options.find((o) => o.id === SEARCH_FOR_LOOSE_METALS_OPTION_ID);
        expect(keep?.action).toEqual({
            type: 'grant_resources',
            food: FOUND_BERRIES_KEEP_FOOD,
        });
        expect(metals?.action).toEqual({
            type: 'grant_resources',
            metal: SURFACE_METAL_HARVEST_METAL,
        });
    });
});
