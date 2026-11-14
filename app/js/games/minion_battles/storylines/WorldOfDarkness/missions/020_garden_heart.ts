/**
 * The Garden Heart - Chapter 3 boss. The north half of the garden (the queen's garden 62_47 and
 * the conservatory 63_47), entered from the crossroads' east road.
 * PLACEHOLDER BOSS: an Alpha Wolf on the loop path north of the pond with the `castle_boss`
 * escort, until the garden's own fight exists.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_62_47_QUEENS_GARDEN } from '../MapSegments/castle/62_47_queens_garden';
import { SEGMENT_63_47_CONSERVATORY } from '../MapSegments/castle/63_47_conservatory';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const GARDEN_HEART_MISSION_ID = 'garden_heart';

const SCRIPT = chapter3Scripts.garden_heart;

export const GARDEN_HEART = defineCastleMission({
    id: GARDEN_HEART_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_62_47_QUEENS_GARDEN.id, SEGMENT_63_47_CONSERVATORY.id],
    entry: castlePoi(SEGMENT_62_47_QUEENS_GARDEN, '62_47_entry_west'),
    spawnPreset: 'castle_boss',
    boss: {
        kind: 'placeholder',
        poi: castlePoi(SEGMENT_62_47_QUEENS_GARDEN, '62_47_boss'),
        label: SCRIPT.objectives.defeat_boss,
    },
});
