/**
 * The Chapel Wing - Chapter 3. From the great hall's east door (reached from the crossroads) through
 * the churchyard (62_46, 63_46), round the chapel to the breach in the east wall, under the
 * standard castle spawn cadence. The first mission of the wizard tower branch.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_62_46_CHAPEL_NAVE } from '../MapSegments/castle/62_46_chapel_nave';
import { SEGMENT_63_46_CHAPEL_ALTAR } from '../MapSegments/castle/63_46_chapel_altar';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const CHAPEL_WING_MISSION_ID = 'chapel_wing';

const SCRIPT = chapter3Scripts.chapel_wing;

export const CHAPEL_WING = defineCastleMission({
    id: CHAPEL_WING_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_62_46_CHAPEL_NAVE.id, SEGMENT_63_46_CHAPEL_ALTAR.id],
    entry: castlePoi(SEGMENT_62_46_CHAPEL_NAVE, '62_46_entry_west'),
    exit: castlePoi(SEGMENT_63_46_CHAPEL_ALTAR, '63_46_exit_east'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
