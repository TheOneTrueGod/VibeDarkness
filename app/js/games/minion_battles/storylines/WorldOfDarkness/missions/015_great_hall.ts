/**
 * The Great Hall - Chapter 3. Through the keep door (61_46) and over the chasm bridge (61_45) to
 * the throne room's door, under the standard castle spawn cadence.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_61_45_CHASM_BRIDGE } from '../MapSegments/castle/61_45_chasm_bridge';
import { SEGMENT_61_46_GREAT_HALL } from '../MapSegments/castle/61_46_great_hall';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const GREAT_HALL_MISSION_ID = 'great_hall';

const SCRIPT = chapter3Scripts.great_hall;

export const GREAT_HALL = defineCastleMission({
    id: GREAT_HALL_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_61_46_GREAT_HALL.id, SEGMENT_61_45_CHASM_BRIDGE.id],
    entry: castlePoi(SEGMENT_61_46_GREAT_HALL, '61_46_entry_south'),
    exit: castlePoi(SEGMENT_61_45_CHASM_BRIDGE, '61_45_exit_north'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
