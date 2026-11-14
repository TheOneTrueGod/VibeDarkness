/**
 * Forage the Garden, mission 1 - The Herb Beds (chapter 3 quest). In through the courtyard's east
 * door, forage the north herb beds (62_48) and the orchard's fruit trees (63_48), then reach the
 * ice house door, under the explore spawn cadence.
 *
 * Quest-only: its own missionId (the garden map mission is `overgrown_garden`) and no Mission Map
 * node (the quest bank is the map node).
 */

import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import { SEGMENT_62_48_HERB_GARDEN } from '../MapSegments/castle/62_48_herb_garden';
import { SEGMENT_63_48_ORCHARD } from '../MapSegments/castle/63_48_orchard';
import { castlePoi, defineCastleMission } from '../missions/castle/castleMission';

export const QUEST_CASTLE_HERB_BEDS_MISSION_ID = 'quest_castle_herb_beds';

const SCRIPT = questScripts.quest_castle_herb_beds;

export const QUEST_CASTLE_HERB_BEDS = defineCastleMission({
    id: QUEST_CASTLE_HERB_BEDS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_62_48_HERB_GARDEN.id, SEGMENT_63_48_ORCHARD.id],
    entry: castlePoi(SEGMENT_62_48_HERB_GARDEN, '62_48_entry_west'),
    exit: castlePoi(SEGMENT_63_48_ORCHARD, '63_48_exit_south'),
    exitLabel: SCRIPT.objectives.reach_exit,
    objectives: [
        {
            id: 'search_herb_beds',
            label: SCRIPT.objectives.search_herb_beds,
            reach: castlePoi(SEGMENT_62_48_HERB_GARDEN, '62_48_herb_beds_north'),
        },
        {
            id: 'search_fruit_trees',
            label: SCRIPT.objectives.search_fruit_trees,
            reach: castlePoi(SEGMENT_63_48_ORCHARD, '63_48_fruit_trees'),
        },
    ],
    spawnPreset: 'castle_explore',
    mapNode: null,
});
