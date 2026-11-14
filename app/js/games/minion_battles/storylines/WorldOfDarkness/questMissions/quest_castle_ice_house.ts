/**
 * Forage the Garden, mission 2 - The Ice House (chapter 3 quest). Down through the orchard door into
 * the ice house (63_49) to search its two cold stores, under the explore spawn cadence. Afterwards
 * everyone recovers some Hunger, then each player eats more or packs the stored food (Vigor).
 *
 * Quest-only: its own missionId and no Mission Map node (the quest bank is the map node).
 */

import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import { SEGMENT_63_49_ICE_HOUSE } from '../MapSegments/castle/63_49_ice_house';
import { castlePoi, defineCastleMission } from '../missions/castle/castleMission';

export const QUEST_CASTLE_ICE_HOUSE_MISSION_ID = 'quest_castle_ice_house';

const SCRIPT = questScripts.quest_castle_ice_house;

export const QUEST_CASTLE_ICE_HOUSE = defineCastleMission({
    id: QUEST_CASTLE_ICE_HOUSE_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    postMissionStory: SCRIPT.postMissionStory,
    rooms: [SEGMENT_63_49_ICE_HOUSE.id],
    entry: castlePoi(SEGMENT_63_49_ICE_HOUSE, '63_49_entry_north'),
    objectives: [
        {
            id: 'search_west',
            label: SCRIPT.objectives.search_west,
            reach: castlePoi(SEGMENT_63_49_ICE_HOUSE, '63_49_cold_store_west'),
        },
        {
            id: 'search_east',
            label: SCRIPT.objectives.search_east,
            reach: castlePoi(SEGMENT_63_49_ICE_HOUSE, '63_49_cold_store_east'),
        },
    ],
    spawnPreset: 'castle_explore',
    mapNode: null,
});
