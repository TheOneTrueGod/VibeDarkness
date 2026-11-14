/**
 * The Wizard's Tower - Chapter 3. An explore mission in the tower's east rooms: in through the
 * wall walk door to the alchemy lab (63_44), then search the great crucible, the binding circle
 * and the great summoning circle (63_45), under the explore spawn cadence. No boss: the Court
 * Magician waits in the next mission.
 *
 * The Mission Map node sits on the summoning-circle tile, below the line from the east wall walk
 * to the walls campsite.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_63_44_ALCHEMY_LAB } from '../MapSegments/castle/63_44_alchemy_lab';
import { SEGMENT_63_45_SUMMONING_CIRCLE } from '../MapSegments/castle/63_45_summoning_circle';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const WIZARDS_TOWER_MISSION_ID = 'wizards_tower';

const SCRIPT = chapter3Scripts.wizards_tower;

export const WIZARDS_TOWER = defineCastleMission({
    id: WIZARDS_TOWER_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [SEGMENT_63_44_ALCHEMY_LAB.id, SEGMENT_63_45_SUMMONING_CIRCLE.id],
    entry: castlePoi(SEGMENT_63_44_ALCHEMY_LAB, '63_44_entry_east'),
    objectives: [
        {
            id: 'reach_crucible',
            label: SCRIPT.objectives.reach_crucible,
            reach: castlePoi(SEGMENT_63_44_ALCHEMY_LAB, '63_44_crucible'),
        },
        {
            id: 'reach_binding_circle',
            label: SCRIPT.objectives.reach_binding_circle,
            reach: castlePoi(SEGMENT_63_45_SUMMONING_CIRCLE, '63_45_binding_circle'),
        },
        {
            id: 'reach_great_circle',
            label: SCRIPT.objectives.reach_great_circle,
            reach: castlePoi(SEGMENT_63_45_SUMMONING_CIRCLE, '63_45_great_circle'),
        },
    ],
    spawnPreset: 'castle_explore',
    mapNode: { col: 63, row: 45 },
});
