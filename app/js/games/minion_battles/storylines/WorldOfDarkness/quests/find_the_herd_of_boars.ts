/**
 * Find the herd of boars — quest run: north push → random plains story → TBD finale.
 * Still tagged as a plumbing / optional fixture (not in the post–Core Awakening bank filters).
 */

import type { QuestDef } from '../../questTypes';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
} from '../questMissions/questMissionConstants';
import { QUEST_BOAR_HERD_NORTH_MISSION_ID } from '../questMissions/quest_boar_herd_north';

/** Temporary third-slot stand-in until real herd finale content exists. */
export const FIND_THE_HERD_OF_BOARS_SLOT3_PLACEHOLDER_MISSION_ID = 'light_empowered';

export const FIND_THE_HERD_OF_BOARS: QuestDef = {
    id: 'find_the_herd_of_boars',
    title: 'Find the herd of boars',
    campaignId: 'world_of_darkness',
    tags: ['placeholder', 'fixed_slots'],
    slots: [
        { kind: 'fixed', missionId: QUEST_BOAR_HERD_NORTH_MISSION_ID },
        {
            kind: 'random_story',
            params: {
                challengeRatingMin: PLAINS_RANDOM_STORY_CHALLENGE_MIN,
                challengeRatingMax: PLAINS_RANDOM_STORY_CHALLENGE_MAX,
                tags: [LOCATION_PLAINS_TAG],
                outcomeBias: 'beneficial',
            },
        },
        { kind: 'fixed', missionId: FIND_THE_HERD_OF_BOARS_SLOT3_PLACEHOLDER_MISSION_ID },
    ],
};
