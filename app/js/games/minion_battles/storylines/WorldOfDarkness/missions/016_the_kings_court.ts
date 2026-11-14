/**
 * The King's Court - Chapter 3 boss. The throne room (61_44), entered from the bridge.
 * PLACEHOLDER BOSS: an Alpha Wolf on the throne with the `castle_boss` escort, until the king's
 * own fight exists.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_61_44_THRONE_ROOM } from '../MapSegments/castle/61_44_throne_room';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const THE_KINGS_COURT_MISSION_ID = 'the_kings_court';

const SCRIPT = chapter3Scripts.the_kings_court;

export const THE_KINGS_COURT = defineCastleMission({
    id: THE_KINGS_COURT_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_61_44_THRONE_ROOM.id],
    entry: castlePoi(SEGMENT_61_44_THRONE_ROOM, '61_44_entry_south'),
    spawnPreset: 'castle_boss',
    boss: {
        kind: 'placeholder',
        poi: castlePoi(SEGMENT_61_44_THRONE_ROOM, '61_44_throne'),
        label: SCRIPT.objectives.defeat_boss,
    },
});
