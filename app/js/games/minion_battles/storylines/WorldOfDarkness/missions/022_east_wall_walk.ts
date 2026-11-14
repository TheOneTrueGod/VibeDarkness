/**
 * The East Wall Walk - Chapter 3. From the breach (64_46) up the winding east wall walk through
 * the murder-hole galleries (64_45) to the guard room (64_44) at the wizard's tower door, under the
 * standard castle spawn cadence. The walls campsite unlocks after it.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM } from '../MapSegments/castle/64_44_east_wall_walk_guardroom';
import { SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES } from '../MapSegments/castle/64_45_east_wall_walk_murder_holes';
import { SEGMENT_64_46_EAST_BREACH } from '../MapSegments/castle/64_46_east_breach';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const EAST_WALL_WALK_MISSION_ID = 'east_wall_walk';

const SCRIPT = chapter3Scripts.east_wall_walk;

export const EAST_WALL_WALK = defineCastleMission({
    id: EAST_WALL_WALK_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [
        SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM.id,
        SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES.id,
        SEGMENT_64_46_EAST_BREACH.id,
    ],
    entry: castlePoi(SEGMENT_64_46_EAST_BREACH, '64_46_entry_west'),
    exit: castlePoi(SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM, '64_44_exit_west'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
