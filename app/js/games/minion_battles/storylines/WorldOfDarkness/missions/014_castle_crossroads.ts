/**
 * The Crossroads - Chapter 3. From the courtyard's south path (61_48) north across the crossroads
 * (61_47) to the great hall's door, under the standard castle spawn cadence.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { COURTYARD_ENTRY_SOUTH, CASTLE_COURTYARD_SEGMENT_ID } from '../MapSegments/61_48_castle_courtyard';
import { SEGMENT_61_47_CROSSROADS } from '../MapSegments/castle/61_47_crossroads';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const CASTLE_CROSSROADS_MISSION_ID = 'castle_crossroads';

const SCRIPT = chapter3Scripts.castle_crossroads;

export const CASTLE_CROSSROADS = defineCastleMission({
    id: CASTLE_CROSSROADS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [CASTLE_COURTYARD_SEGMENT_ID, SEGMENT_61_47_CROSSROADS.id],
    entry: { id: '61_48_entry_south', ...COURTYARD_ENTRY_SOUTH },
    exit: castlePoi(SEGMENT_61_47_CROSSROADS, '61_47_exit_north'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
