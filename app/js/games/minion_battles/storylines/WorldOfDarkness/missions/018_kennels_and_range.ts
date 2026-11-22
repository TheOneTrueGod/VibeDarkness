/**
 * Kennels and Range - Chapter 3, optional. After Raid the Larder: the west half of the training ring,
 * from the kennel yard's south door by the storerooms (59_48) north to the two campfire spots at the
 * south end of the archery green (59_47), under the standard castle spawn cadence. It forks to The
 * Training Grounds and to the training campsite on the campfires.
 *
 * The Mission Map node sits on the kennel yard, so the campsite node can sit on the campfires just
 * north of it.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_59_47_ARCHERY_GREEN } from '../MapSegments/castle/59_47_archery_green';
import { SEGMENT_59_48_KENNEL_YARD } from '../MapSegments/castle/59_48_kennel_yard';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const KENNELS_AND_RANGE_MISSION_ID = 'kennels_and_range';

const SCRIPT = chapter3Scripts.kennels_and_range;

export const KENNELS_AND_RANGE = defineCastleMission({
    id: KENNELS_AND_RANGE_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_59_47_ARCHERY_GREEN.id, SEGMENT_59_48_KENNEL_YARD.id],
    entry: castlePoi(SEGMENT_59_48_KENNEL_YARD, '59_48_entry_south'),
    exit: castlePoi(SEGMENT_59_47_ARCHERY_GREEN, '59_47_exit_campfires'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
    mapNode: { col: 59, row: 48 },
    isSideMission: true,
});
