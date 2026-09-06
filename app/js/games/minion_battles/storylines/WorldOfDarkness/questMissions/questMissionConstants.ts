/**
 * Shared constants for World of Darkness quest-only missions and random story bags.
 */

import { coreEarthItem } from '../../../character_defs/items/core/019_core_earth';

/** Tag for plains-location random story / quest filters. */
export const LOCATION_PLAINS_TAG = 'location:plains';

/** Player-facing label for the shared "Search for loose metals" story choice. */
export const SEARCH_FOR_LOOSE_METALS_LABEL = 'Search for loose metals';

/** Stable option id for Search for loose metals (kept as `harvest` for in-progress runs). */
export const SEARCH_FOR_LOOSE_METALS_OPTION_ID = 'harvest';

/** Disabled-option copy: `Requires ${itemName}`. */
export function requiresItemLabel(itemName: string): string {
    return `Requires ${itemName}`;
}

/** Extract Metal gate — Earth Core item name. */
export const REQUIRES_EARTH_CORE_LABEL = requiresItemLabel(coreEarthItem.name);

/** Challenge rating for the first random-story bag entries. */
export const PLAINS_STORY_CHALLENGE_RATING = 10;

/** Random story slot filter for the Scavenge the Plains quest. */
export const PLAINS_RANDOM_STORY_CHALLENGE_MIN = 10;
export const PLAINS_RANDOM_STORY_CHALLENGE_MAX = 20;

/** Found Berries — Keep the Berries Campaign Reward. */
export const FOUND_BERRIES_KEEP_FOOD = 2;

/** Search for loose metals — Campaign Reward (chooser). */
export const SURFACE_METAL_HARVEST_METAL = 3;

/** Surface metal deposit — Extract Metal Campaign Reward (chooser). */
export const SURFACE_METAL_EXTRACT_SELF_METAL = 5;

/** Surface metal deposit — Extract Metal Campaign Reward for each other player. */
export const SURFACE_METAL_EXTRACT_OTHERS_METAL = 2;

/** Scavenge the Plains quest completion Campaign Rewards. */
export const SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS = 5;
export const SCAVENGE_THE_PLAINS_COMPLETION_FOOD = 5;
