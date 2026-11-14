/**
 * Raid the Larder, mission 1 - The West Guardhouse (chapter 3 quest). From the courtyard's west
 * door across the sparring pit (60_48) and down into the west guardhouse (60_49), fighting through
 * to its west door into the storerooms, under the standard castle spawn cadence.
 *
 * Quest-only: its own missionId (so results never collide with the castle map missions) and no
 * Mission Map node. The quest bank is the map node.
 */

import { questScripts } from '../../../../../storylines/worldOfDarkness/quests.script';
import { SEGMENT_60_48_SPARRING_PIT } from '../MapSegments/castle/60_48_sparring_pit';
import { SEGMENT_60_49_WEST_GUARDHOUSE } from '../MapSegments/castle/60_49_west_guardhouse';
import { castlePoi, defineCastleMission } from '../missions/castle/castleMission';

export const QUEST_CASTLE_GUARDHOUSE_MISSION_ID = 'quest_castle_guardhouse';

const SCRIPT = questScripts.quest_castle_guardhouse;

export const QUEST_CASTLE_GUARDHOUSE = defineCastleMission({
    id: QUEST_CASTLE_GUARDHOUSE_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_60_48_SPARRING_PIT.id, SEGMENT_60_49_WEST_GUARDHOUSE.id],
    entry: castlePoi(SEGMENT_60_48_SPARRING_PIT, '60_48_entry_east'),
    exit: castlePoi(SEGMENT_60_49_WEST_GUARDHOUSE, '60_49_exit_west'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
    mapNode: null,
});
