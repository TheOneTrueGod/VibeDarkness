/**
 * 61_45 Great Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Feasting hall. Long tables (1-wide rock) run north-south either side of the walkway with a gap
 * at the middle; a split high table at the north end. 1-wide side doors to the training yard and
 * scriptorium.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_61_45_GREAT_HALL: CastleSegment = {
    id: '61_45_great_hall',
    gridCol: 61,
    gridRow: 45,
    description: "The heart of a castle's daily life: the household ate, feasted and heard disputes here, and many servants slept on its floor. The lord's table stood on a raised dais.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, R, R, D, D, D, D, R, R, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, R, D, D, D, D, D, D, R, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Walkway between the tables.
        { id: '61_45_great_hall_center', label: 'Great Hall Center', col: 10, row: 14, type: 'patrol_point' },
        // Between the two halves of the high table.
        { id: '61_45_great_hall_high_table', label: 'High Table', col: 10, row: 2, type: 'generic' },
        // Along the west wall behind the tables.
        { id: '61_45_great_hall_west', label: 'Great Hall West Benches', col: 2, row: 15, type: 'enemySpawn' },
        // Along the east wall behind the tables.
        { id: '61_45_great_hall_east', label: 'Great Hall East Benches', col: 19, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_45_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '61_45_center'],
        ],
    },
};
