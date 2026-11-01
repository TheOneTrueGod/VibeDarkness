/**
 * 64_41 Queen's Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Walled garden with L-shaped low walls in each corner and a pond in the middle.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_64_41_QUEENS_GARDEN: CastleSegment = {
    id: '64_41_queens_garden',
    gridCol: 64,
    gridRow: 41,
    description: 'A walled private garden for the royal family, with paths, flower beds and a fountain, for leisure away from the court.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, R, R, R, R, R, _, _, _, _, R, R, R, R, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, _, _, _, D],
        [R, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, _, _, _, D],
        [R, _, _, _, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R],
        [R, _, _, _, R, R, R, R, R, _, _, _, _, R, R, R, R, R, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North of the pond.
        { id: '64_41_queens_garden', label: 'Queen\'s Garden', col: 10, row: 7, type: 'patrol_point' },
        // South-west corner.
        { id: '64_41_queens_garden_southwest', label: 'Garden South-west', col: 2, row: 19, type: 'enemySpawn' },
        // North-east corner.
        { id: '64_41_queens_garden_northeast', label: 'Garden North-east', col: 19, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_41_center', position: { kind: 'gridPoint', col: 10, row: 7 }, tags: ['castle'] }],
        edges: [
            ['64_42_center', '64_41_center'],
        ],
    },
};
