/**
 * The Overgrown Garden - Chapter 3. Through the courtyard's east door into the garden: from the
 * herb garden (62_48) round the pond loop and across the orchard (63_48) to the conservatory's
 * side, under the standard castle spawn cadence. The Garden Heart (boss) unlocks after it.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_62_48_HERB_GARDEN } from '../MapSegments/castle/62_48_herb_garden';
import { SEGMENT_63_48_ORCHARD } from '../MapSegments/castle/63_48_orchard';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const OVERGROWN_GARDEN_MISSION_ID = 'overgrown_garden';

const SCRIPT = chapter3Scripts.overgrown_garden;

export const OVERGROWN_GARDEN = defineCastleMission({
    id: OVERGROWN_GARDEN_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_62_48_HERB_GARDEN.id, SEGMENT_63_48_ORCHARD.id],
    entry: castlePoi(SEGMENT_62_48_HERB_GARDEN, '62_48_entry_west'),
    exit: castlePoi(SEGMENT_63_48_ORCHARD, '63_48_exit_north'),
    exitLabel: SCRIPT.objectives.reach_exit,
    spawnPreset: 'castle_standard',
});
