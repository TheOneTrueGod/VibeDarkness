/**
 * 58_43 Interrogation Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper west wing corridor with a torture chamber, a jailer's office and an interrogation room off
 * it; passages north to the dungeon block and south to the cells.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_58_43_INTERROGATION_HALL: CastleSegment = {
    id: '58_43_interrogation_hall',
    gridCol: 58,
    gridRow: 43,
    description: 'Rooms where prisoners were questioned, often under threat of the instruments kept beside them.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, R, R, R, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, D, R, R, R, R, D, D, R, R, R, R, R, D, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, D, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, R, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, D, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Corridor centre.
        { id: '58_43_interrogation_corridor', label: 'Interrogation Corridor', col: 10, row: 10, type: 'patrol_point' },
        // Torture chamber.
        { id: '58_43_torture_chamber', label: 'Torture Chamber', col: 5, row: 6, type: 'enemySpawn' },
        // Interrogation room.
        { id: '58_43_interrogation_room', label: 'Interrogation Room', col: 15, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_43_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['59_43_center', '58_43_center'],
            ['58_44_center', '58_43_center'],
        ],
    },
};
