/**
 * Swarmling Source — quest run: north push → random plains story → Swarmling Nest finale.
 * Dedicated chapter 2 map node; also matches Surface Quests (`location:plains`).
 */

import type { QuestDef } from '../../questTypes';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
    SWARMLING_SOURCE_COMPLETION_CRYSTALS,
    SWARMLING_SOURCE_COMPLETION_METAL,
} from '../questMissions/questMissionConstants';
import { QUEST_PUSH_NORTH_MISSION_ID } from '../questMissions/quest_push_north';
import { SWARMLING_NEST_MISSION_ID } from '../questMissions/swarmling_nest';

export const SWARMLING_SOURCE_QUEST_ID = 'swarmling_source';
export const SWARMLING_SOURCE_TITLE = 'Swarmling Source';

/** Third slot: the Swarmling Nest arena finale. */
export const SWARMLING_SOURCE_FINALE_MISSION_ID = SWARMLING_NEST_MISSION_ID;

export const SWARMLING_SOURCE: QuestDef = {
    id: SWARMLING_SOURCE_QUEST_ID,
    title: SWARMLING_SOURCE_TITLE,
    campaignId: 'world_of_darkness',
    tags: [LOCATION_PLAINS_TAG, 'placeholder', 'fixed_slots'],
    slots: [
        { kind: 'fixed', missionId: QUEST_PUSH_NORTH_MISSION_ID },
        {
            kind: 'random_story',
            params: {
                challengeRatingMin: PLAINS_RANDOM_STORY_CHALLENGE_MIN,
                challengeRatingMax: PLAINS_RANDOM_STORY_CHALLENGE_MAX,
                tags: [LOCATION_PLAINS_TAG],
                outcomeBias: 'beneficial',
            },
        },
        { kind: 'fixed', missionId: SWARMLING_SOURCE_FINALE_MISSION_ID },
    ],
    completionRewards: {
        resourceDelta: {
            crystals: SWARMLING_SOURCE_COMPLETION_CRYSTALS,
            metal: SWARMLING_SOURCE_COMPLETION_METAL,
        },
    },
};
