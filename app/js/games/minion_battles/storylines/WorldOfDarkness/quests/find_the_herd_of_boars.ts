/**
 * Find the herd of boars — quest run: north push → random plains story → Swarmling Nest finale.
 * Exposed as a dedicated chapter 2 map node (not in the Surface Quests picker).
 */

import type { QuestDef } from '../../questTypes';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
} from '../questMissions/questMissionConstants';
import { QUEST_BOAR_HERD_NORTH_MISSION_ID } from '../questMissions/quest_boar_herd_north';
import { SWARMLING_NEST_MISSION_ID } from '../questMissions/swarmling_nest';

export const FIND_THE_HERD_OF_BOARS_QUEST_ID = 'find_the_herd_of_boars';

/** Third slot: the Swarmling Nest arena finale. */
export const FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID = SWARMLING_NEST_MISSION_ID;

export const FIND_THE_HERD_OF_BOARS: QuestDef = {
    id: FIND_THE_HERD_OF_BOARS_QUEST_ID,
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
        { kind: 'fixed', missionId: FIND_THE_HERD_OF_BOARS_FINALE_MISSION_ID },
    ],
};
