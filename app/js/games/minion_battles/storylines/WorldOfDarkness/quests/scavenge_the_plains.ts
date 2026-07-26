/**
 * First real World of Darkness quest: random plains story → hunt → crystal corruption.
 */

import type { QuestDef } from '../../questTypes';
import {
    LOCATION_PLAINS_TAG,
    PLAINS_RANDOM_STORY_CHALLENGE_MAX,
    PLAINS_RANDOM_STORY_CHALLENGE_MIN,
    SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS,
    SCAVENGE_THE_PLAINS_COMPLETION_FOOD,
} from '../questMissions/questMissionConstants';
import { QUEST_FIND_SOME_FOOD_MISSION_ID } from '../questMissions/quest_find_some_food';
import { QUEST_CRYSTAL_CORRUPTION_MISSION_ID } from '../questMissions/quest_crystal_corruption';

export const SCAVENGE_THE_PLAINS_QUEST_ID = 'scavenge_the_plains';

export const SCAVENGE_THE_PLAINS: QuestDef = {
    id: SCAVENGE_THE_PLAINS_QUEST_ID,
    title: 'Scavenge the Plains',
    campaignId: 'world_of_darkness',
    tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'],
    slots: [
        {
            kind: 'random_story',
            params: {
                challengeRatingMin: PLAINS_RANDOM_STORY_CHALLENGE_MIN,
                challengeRatingMax: PLAINS_RANDOM_STORY_CHALLENGE_MAX,
                tags: [LOCATION_PLAINS_TAG],
                outcomeBias: 'beneficial',
            },
        },
        { kind: 'fixed', missionId: QUEST_FIND_SOME_FOOD_MISSION_ID },
        { kind: 'fixed', missionId: QUEST_CRYSTAL_CORRUPTION_MISSION_ID },
    ],
    completionRewards: {
        resourceDelta: {
            crystals: SCAVENGE_THE_PLAINS_COMPLETION_CRYSTALS,
            food: SCAVENGE_THE_PLAINS_COMPLETION_FOOD,
        },
    },
};
