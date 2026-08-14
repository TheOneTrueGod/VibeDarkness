/**
 * Story background image URLs for pre-mission story segments.
 * Import in mission defs to reference assets.
 */
import campfireUrl from './campfire.png';
import gatherPartyUrl from './gather_party.png';
import surfaceMetalDepositUrl from './surface_metal_deposit.svg';
import foundBerriesUrl from './found_berries.svg';

export const STORY_BACKGROUNDS = {
    campfire: campfireUrl,
    /** Default backdrop for the post-story “gather your party” wait screen. */
    gatherParty: gatherPartyUrl,
    /** Surface metal deposit random-story mission. */
    surfaceMetalDeposit: surfaceMetalDepositUrl,
    /** Found Berries random-story mission. */
    foundBerries: foundBerriesUrl,
} as const;
