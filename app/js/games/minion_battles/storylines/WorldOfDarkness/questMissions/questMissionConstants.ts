/**
 * Shared constants for World of Darkness quest-only missions and random story bags.
 */

import { coreEarthItem } from '../../../character_defs/items/core/019_core_earth';

/** Tag for plains-location random story / quest filters. */
export const LOCATION_PLAINS_TAG = 'location:plains';

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
export const FOUND_BERRIES_KEEP_VIGOR = 2;

/** Found Berries — Eat the Berries recovers this much Hunger. */
export const FOUND_BERRIES_EAT_HUNGER_RECOVERY = 10;

/** Stable option id for the shared Rest story choice. */
export const REST_OPTION_ID = 'rest';

/** Rest — Hunger (food) recovered by the chooser. */
export const REST_HUNGER_RECOVERY = 20;

/** Search for loose metals — Campaign Reward (chooser). */
export const SURFACE_METAL_HARVEST_METAL = 3;

/** Surface metal deposit — Extract Metal Campaign Reward (chooser). */
export const SURFACE_METAL_EXTRACT_SELF_METAL = 5;

/** Surface metal deposit — Extract Metal Campaign Reward for each other player. */
export const SURFACE_METAL_EXTRACT_OTHERS_METAL = 2;

/** Scavenge the Plains quest completion Campaign Rewards. */
export const SCAVENGE_THE_PLAINS_COMPLETION_ATTUNEMENT = 5;
export const SCAVENGE_THE_PLAINS_COMPLETION_VIGOR = 10;
export const SCAVENGE_THE_PLAINS_COMPLETION_METAL = 5;

/** Investigate the Wildlife quest completion Campaign Rewards (copied from Scavenge the Plains). */
export const INVESTIGATE_THE_WILDLIFE_COMPLETION_ATTUNEMENT = SCAVENGE_THE_PLAINS_COMPLETION_ATTUNEMENT;
export const INVESTIGATE_THE_WILDLIFE_COMPLETION_VIGOR = SCAVENGE_THE_PLAINS_COMPLETION_VIGOR;
export const INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL = SCAVENGE_THE_PLAINS_COMPLETION_METAL;

/** Swarmling Source quest completion Campaign Rewards. */
export const SWARMLING_SOURCE_COMPLETION_ATTUNEMENT = 15;
export const SWARMLING_SOURCE_COMPLETION_METAL = 15;
export const SWARMLING_SOURCE_COMPLETION_VIGOR = 5;

/** Tag for chapter 3 castle quests (kept off the plains Surface Quests pickers). */
export const LOCATION_CASTLE_TAG = 'location:castle';

/** Forage the Garden — Hunger every player recovers after the ice house. */
export const CASTLE_ICE_HOUSE_HUNGER_RECOVERY = 10;
/** Forage the Garden — "Eat the cold stores" recovers this much more Hunger (chooser). */
export const CASTLE_ICE_HOUSE_EAT_HUNGER_RECOVERY = 10;
/** Forage the Garden — "Pack the cold stores" Campaign Reward (chooser). */
export const CASTLE_ICE_HOUSE_PACK_VIGOR = 2;
/** Forage the Garden quest completion Campaign Rewards. */
export const FORAGE_THE_GARDEN_COMPLETION_VIGOR = 3;

/** Location card ids for quest rewards. */
export const FOUND_BERRIES_LOCATION_CARD_ID = 1;
export const SURFACE_METAL_DEPOSIT_LOCATION_CARD_ID = 2;
