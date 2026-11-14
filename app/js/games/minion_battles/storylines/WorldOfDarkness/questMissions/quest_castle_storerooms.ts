/**
 * Raid the Larder, mission 2 - The Storerooms (chapter 3 quest). In through the east door from the
 * west guardhouse, then search the west storeroom and the salt meat store (59_49) under the explore
 * spawn cadence. Afterwards everyone recovers some Hunger, then each player picks food or metal.
 *
 * Quest-only: its own missionId and no Mission Map node (the quest bank is the map node).
 */

import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import { SEGMENT_59_49_STOREROOMS } from '../MapSegments/castle/59_49_storerooms';
import { castlePoi, defineCastleMission } from '../missions/castle/castleMission';

export const QUEST_CASTLE_STOREROOMS_MISSION_ID = 'quest_castle_storerooms';

const SCRIPT = questScripts.quest_castle_storerooms;

export const QUEST_CASTLE_STOREROOMS = defineCastleMission({
    id: QUEST_CASTLE_STOREROOMS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    postMissionStory: SCRIPT.postMissionStory,
    rooms: [SEGMENT_59_49_STOREROOMS.id],
    entry: castlePoi(SEGMENT_59_49_STOREROOMS, '59_49_entry_east'),
    objectives: [
        {
            id: 'search_west',
            label: SCRIPT.objectives.search_west,
            reach: castlePoi(SEGMENT_59_49_STOREROOMS, '59_49_search_west'),
        },
        {
            id: 'search_middle',
            label: SCRIPT.objectives.search_middle,
            reach: castlePoi(SEGMENT_59_49_STOREROOMS, '59_49_search_middle'),
        },
    ],
    spawnPreset: 'castle_explore',
    mapNode: null,
});
