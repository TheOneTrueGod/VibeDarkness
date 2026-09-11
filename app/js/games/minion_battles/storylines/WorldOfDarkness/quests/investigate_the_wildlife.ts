/**
 * Investigate the Wildlife — lanternite threshold → random plains story → thorn march.
 * Dedicated chapter 2 map node; also matches Surface Quests (`location:plains`).
 */

import type { QuestDef } from '../../questTypes';
import {
    INVESTIGATE_THE_WILDLIFE_COMPLETION_CRYSTALS,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_FOOD,
    INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL,
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
} from '../questMissions/questMissionConstants';
import { QUEST_EMBER_THRESHOLD_MISSION_ID } from '../questMissions/quest_ember_threshold';
import { QUEST_THORN_MARCH_MISSION_ID } from '../questMissions/quest_thorn_march';

export const INVESTIGATE_THE_WILDLIFE_QUEST_ID = 'investigate_the_wildlife';
export const INVESTIGATE_THE_WILDLIFE_TITLE = 'Investigate the Wildlife';

export const INVESTIGATE_THE_WILDLIFE: QuestDef = {
    id: INVESTIGATE_THE_WILDLIFE_QUEST_ID,
    title: INVESTIGATE_THE_WILDLIFE_TITLE,
    campaignId: 'world_of_darkness',
    tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'],
    slots: [
        { kind: 'fixed', missionId: QUEST_EMBER_THRESHOLD_MISSION_ID },
        {
            kind: 'random_story',
            params: {
                challengeRatingMin: PLAINS_RANDOM_STORY_CHALLENGE_MIN,
                challengeRatingMax: PLAINS_RANDOM_STORY_CHALLENGE_MAX,
                tags: [LOCATION_PLAINS_TAG],
                outcomeBias: 'beneficial',
            },
        },
        { kind: 'fixed', missionId: QUEST_THORN_MARCH_MISSION_ID },
    ],
    completionRewards: {
        resourceDelta: {
            crystals: INVESTIGATE_THE_WILDLIFE_COMPLETION_CRYSTALS,
            food: INVESTIGATE_THE_WILDLIFE_COMPLETION_FOOD,
            metal: INVESTIGATE_THE_WILDLIFE_COMPLETION_METAL,
        },
    },
};
