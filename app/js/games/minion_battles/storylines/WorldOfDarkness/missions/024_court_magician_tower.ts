/**
 * The Court Magician - Chapter 3 boss. The whole wizard's tower (62-63 x 44-45), entered from the
 * wall walk door into the alchemy lab. The magician stands in the great summoning circle with his
 * crystal ring (`courtMagicianBossSetup`, shared with the Chapter 0 test bed `013`); the
 * `castle_boss` preset adds its opening escort. A unit that would start on blocked ground (one of
 * the circle's standing stones) is moved to open ground by `defineCastleMission`.
 *
 * The Mission Map node sits west of the circle, clear of The Wizard's Tower node and of the line
 * from the east wall walk to the walls campsite.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_62_44_GREAT_LIBRARY } from '../MapSegments/castle/62_44_great_library';
import { SEGMENT_62_45_WIZARDS_STUDY } from '../MapSegments/castle/62_45_wizards_study';
import { SEGMENT_63_44_ALCHEMY_LAB } from '../MapSegments/castle/63_44_alchemy_lab';
import { SEGMENT_63_45_SUMMONING_CIRCLE } from '../MapSegments/castle/63_45_summoning_circle';
import { courtMagicianBossSetup } from './castle/castleBosses';
import { castlePoi, defineCastleMission } from './castle/castleMission';

export const COURT_MAGICIAN_TOWER_MISSION_ID = 'court_magician_tower';

const SCRIPT = chapter3Scripts.court_magician_tower;

export const COURT_MAGICIAN_TOWER = defineCastleMission({
    id: COURT_MAGICIAN_TOWER_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [
        SEGMENT_62_44_GREAT_LIBRARY.id,
        SEGMENT_63_44_ALCHEMY_LAB.id,
        SEGMENT_62_45_WIZARDS_STUDY.id,
        SEGMENT_63_45_SUMMONING_CIRCLE.id,
    ],
    entry: castlePoi(SEGMENT_63_44_ALCHEMY_LAB, '63_44_entry_east'),
    spawnPreset: 'castle_boss',
    boss: {
        kind: 'custom',
        poi: castlePoi(SEGMENT_63_45_SUMMONING_CIRCLE, '63_45_great_circle'),
        setup: (centre) => courtMagicianBossSetup(centre, SCRIPT.objectives.defeat_court_magician),
    },
    mapNode: { col: 62.25, row: 44.75 },
});
