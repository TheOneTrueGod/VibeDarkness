/**
 * The Royal Chambers - Chapter 3. In through the wall walk door to the master bedroom (59_44),
 * south into the royal baths (59_45) and round the bath to the door east into the privy chamber,
 * under the standard castle spawn cadence. The boss waits in the next mission.
 *
 * The Mission Map node sits on the baths tile: the rooms' centre (the bedroom / baths seam) is
 * too close to the line from the west wall walk to the walls campsite.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_59_44_MASTER_BEDROOM } from '../MapSegments/castle/59_44_master_bedroom';
import { SEGMENT_59_45_ROYAL_BATHS } from '../MapSegments/castle/59_45_royal_baths';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const ROYAL_CHAMBERS_MISSION_ID = 'royal_chambers';

const SCRIPT = chapter3Scripts.royal_chambers;

export const ROYAL_CHAMBERS = defineCastleMission({
    id: ROYAL_CHAMBERS_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_59_44_MASTER_BEDROOM.id, SEGMENT_59_45_ROYAL_BATHS.id],
    entry: castlePoi(SEGMENT_59_44_MASTER_BEDROOM, '59_44_entry_west'),
    exit: castlePoi(SEGMENT_59_45_ROYAL_BATHS, '59_45_exit_east'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
    mapNode: { col: 59, row: 45 },
});
