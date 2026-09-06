/**
 * Shared "Search for loose metals" post-mission choice for random-story bag missions.
 */

import type { StoryChoiceOptionRow } from '../../storyTypes';
import {
    SEARCH_FOR_LOOSE_METALS_LABEL,
    SEARCH_FOR_LOOSE_METALS_OPTION_ID,
    SURFACE_METAL_HARVEST_METAL,
} from './questMissionConstants';

export function buildSearchForLooseMetalsOption(): StoryChoiceOptionRow {
    return {
        id: SEARCH_FOR_LOOSE_METALS_OPTION_ID,
        label: SEARCH_FOR_LOOSE_METALS_LABEL,
        loreTitle: SEARCH_FOR_LOOSE_METALS_LABEL,
        loreDescription:
            `Chip samples from the outcrop. Campaign Reward: +${SURFACE_METAL_HARVEST_METAL} Metal when the quest ends.`,
        action: {
            type: 'grant_resources',
            metal: SURFACE_METAL_HARVEST_METAL,
        },
    };
}
