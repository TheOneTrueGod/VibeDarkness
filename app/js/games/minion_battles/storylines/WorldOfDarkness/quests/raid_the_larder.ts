/**
 * Raid the Larder - chapter 3 scavenging quest. Dedicated castle map node (on the west guardhouse /
 * storerooms), unlocked by The Castle Courtyard: fight through the west guardhouse, then scavenge
 * the storerooms (Hunger recovery plus a food-or-metal pick).
 */

import type { QuestDef } from '../../questTypes';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { LOCATION_CASTLE_TAG, RAID_THE_LARDER_COMPLETION_METAL } from '../questMissions/questMissionConstants';
import { QUEST_CASTLE_GUARDHOUSE_MISSION_ID } from '../questMissions/quest_castle_guardhouse';
import { QUEST_CASTLE_STOREROOMS_MISSION_ID } from '../questMissions/quest_castle_storerooms';

export const RAID_THE_LARDER_QUEST_ID = 'raid_the_larder';

export const RAID_THE_LARDER: QuestDef = {
    id: RAID_THE_LARDER_QUEST_ID,
    // TODO(story): placeholder title and description.
    title: 'Raid the Larder',
    description: "The castle's stores lie past the west guardhouse. Whatever is left in them is yours.",
    campaignId: 'world_of_darkness',
    prepBackgroundImage: STORY_BACKGROUNDS.campfire,
    tags: [LOCATION_CASTLE_TAG],
    slots: [
        { kind: 'fixed', missionId: QUEST_CASTLE_GUARDHOUSE_MISSION_ID },
        { kind: 'fixed', missionId: QUEST_CASTLE_STOREROOMS_MISSION_ID },
    ],
    completionRewards: {
        resourceDelta: { metal: RAID_THE_LARDER_COMPLETION_METAL },
    },
};
