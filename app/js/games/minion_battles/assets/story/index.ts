/**
 * Story background image URLs for pre-mission story segments.
 * Import in mission defs to reference assets.
 */
import campfireUrl from './campfire.png';
import gatherPartyUrl from './gather_party.png';

export const STORY_BACKGROUNDS = {
    campfire: campfireUrl,
    /** Default backdrop for the post-story “gather your party” wait screen. */
    gatherParty: gatherPartyUrl,
} as const;
