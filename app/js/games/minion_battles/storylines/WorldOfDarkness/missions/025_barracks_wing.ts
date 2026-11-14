/**
 * The Barracks Wing - Chapter 3. From the barracks lane door (reached from the crossroads) up into
 * the barracks yard (60_46), then west along the wing path through the portcullis hall (59_46) to
 * the sally port, under the standard castle spawn cadence. The first mission of the royal
 * chambers branch.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_59_46_PORTCULLIS_HALL } from '../MapSegments/castle/59_46_portcullis_hall';
import { SEGMENT_60_46_BARRACKS } from '../MapSegments/castle/60_46_barracks';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const BARRACKS_WING_MISSION_ID = 'barracks_wing';

const SCRIPT = chapter3Scripts.barracks_wing;

export const BARRACKS_WING = defineCastleMission({
    id: BARRACKS_WING_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_59_46_PORTCULLIS_HALL.id, SEGMENT_60_46_BARRACKS.id],
    entry: castlePoi(SEGMENT_60_46_BARRACKS, '60_46_entry_south'),
    exit: castlePoi(SEGMENT_59_46_PORTCULLIS_HALL, '59_46_exit_west'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
