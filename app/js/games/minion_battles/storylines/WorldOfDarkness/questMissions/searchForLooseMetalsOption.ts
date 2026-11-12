/**
 * Shared "Search for loose metals" post-mission choice for random-story bag missions.
 */

import type { StoryChoiceOptionRow } from '../../storyTypes';
import { searchForLooseMetalsText } from '../../../../../storylines/worldOfDarkness/quests.script';
import {
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_HARVEST_METAL,
} from './questMissionConstants';

export function buildSearchForLooseMetalsOption(): StoryChoiceOptionRow {
    return {
        id: SEARCH_FOR_LOOSE_METALS_OPTION_ID,
        label: searchForLooseMetalsText.label,
        loreTitle: searchForLooseMetalsText.label,
        loreDescription: searchForLooseMetalsText.loreDescription,
        action: {
            type: 'grant_resources',
            metal: SURFACE_METAL_HARVEST_METAL,
        },
    };
}
