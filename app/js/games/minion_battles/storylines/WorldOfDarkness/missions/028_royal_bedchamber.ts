/**
 * The Royal Bedchamber - Chapter 3 boss. The whole royal chambers 2x2 (59-60 x 44-45), entered
 * where The Royal Chambers ended: the privy chamber's door from the baths. The party goes back
 * round through the baths or the solar to the master bedroom.
 * PLACEHOLDER BOSS: an Alpha Wolf at the foot of the royal bed with the `castle_boss` escort,
 * until the royal chambers' own fight exists.
 *
 * The Mission Map node sits on the solar / privy chamber column, east of the line from the west
 * wall walk to the walls campsite (which runs through the bedroom tile).
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_59_44_MASTER_BEDROOM } from '../MapSegments/castle/59_44_master_bedroom';
import { SEGMENT_59_45_ROYAL_BATHS } from '../MapSegments/castle/59_45_royal_baths';
import { SEGMENT_60_44_ROYAL_SOLAR } from '../MapSegments/castle/60_44_royal_solar';
import { SEGMENT_60_45_PRIVY_CHAMBER } from '../MapSegments/castle/60_45_privy_chamber';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const ROYAL_BEDCHAMBER_MISSION_ID = 'royal_bedchamber';

const SCRIPT = chapter3Scripts.royal_bedchamber;

export const ROYAL_BEDCHAMBER = defineCastleMission({
    id: ROYAL_BEDCHAMBER_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [
        SEGMENT_59_44_MASTER_BEDROOM.id,
        SEGMENT_60_44_ROYAL_SOLAR.id,
        SEGMENT_59_45_ROYAL_BATHS.id,
        SEGMENT_60_45_PRIVY_CHAMBER.id,
    ],
    entry: castlePoi(SEGMENT_60_45_PRIVY_CHAMBER, '60_45_entry_west'),
    spawnPreset: 'castle_boss',
    boss: {
        kind: 'placeholder',
        poi: castlePoi(SEGMENT_59_44_MASTER_BEDROOM, '59_44_boss'),
        label: SCRIPT.objectives.defeat_boss,
    },
    mapNode: { col: 60, row: 44.5 },
});
