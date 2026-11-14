/**
 * The West Wall Walk - Chapter 3. From the sally port (58_46) up the winding west wall walk
 * through the murder-hole galleries (58_45) to the guard room (58_44) at the royal chambers' door,
 * under the standard castle spawn cadence. The walls campsite unlocks after it (as after the east
 * wall walk).
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM } from '../MapSegments/castle/58_44_west_wall_walk_guardroom';
import { SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES } from '../MapSegments/castle/58_45_west_wall_walk_murder_holes';
import { SEGMENT_58_46_WEST_SALLY_PORT } from '../MapSegments/castle/58_46_west_sally_port';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const WEST_WALL_WALK_MISSION_ID = 'west_wall_walk';

const SCRIPT = chapter3Scripts.west_wall_walk;

export const WEST_WALL_WALK = defineCastleMission({
    id: WEST_WALL_WALK_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [
        SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM.id,
        SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES.id,
        SEGMENT_58_46_WEST_SALLY_PORT.id,
    ],
    entry: castlePoi(SEGMENT_58_46_WEST_SALLY_PORT, '58_46_entry_east'),
    exit: castlePoi(SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM, '58_44_exit_east'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
