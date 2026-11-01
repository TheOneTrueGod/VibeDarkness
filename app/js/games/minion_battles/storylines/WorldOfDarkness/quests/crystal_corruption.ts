/**
 * Crystal Corruption — single-mission side quest. Dedicated chapter 2 map node; also matches
 * Surface Quests (`location:plains`).
 */

import type { QuestDef } from '../../questTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { LOCATION_PLAINS_TAG } from '../questMissions/questMissionConstants';
import { QUEST_CRYSTAL_CORRUPTION_MISSION_ID } from '../questMissions/quest_crystal_corruption';

export const CRYSTAL_CORRUPTION_QUEST_ID = 'crystal_corruption';

export const CRYSTAL_CORRUPTION_QUEST: QuestDef = {
    id: CRYSTAL_CORRUPTION_QUEST_ID,
    title: 'Crystal Corruption',
    description: 'Purge the corruption spreading through the crystal cave.',
    campaignId: 'world_of_darkness',
    prepBackgroundImage: STORY_BACKGROUNDS.campfire,
    tags: [LOCATION_PLAINS_TAG, 'post_core_awakening'],
    slots: [{ kind: 'fixed', missionId: QUEST_CRYSTAL_CORRUPTION_MISSION_ID }],
};
