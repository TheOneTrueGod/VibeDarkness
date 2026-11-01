/**
 * 63_41 Royal Baths - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A large bath (Shallow Water, deepening to Water and Deep Water) between columns.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_63_41_ROYAL_BATHS: CastleSegment = {
    id: '63_41_royal_baths',
    gridCol: 63,
    gridRow: 41,
    description: 'Private bathing rooms for the royal family, with heated pools, a rare luxury in a castle.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, D, D, D, D, D, R],
        [R, D, D, D, D, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, W, W, W, W, W, W, W, W, SW, SW, SW, D, D, D, R],
        [R, D, R, R, SW, SW, SW, W, W, W, DW, DW, W, W, W, SW, SW, SW, R, R, D, R],
        [R, D, R, R, SW, SW, W, W, W, DW, DW, DW, DW, W, W, W, SW, SW, R, R, D, R],
        [R, D, D, D, SW, SW, SW, W, W, W, DW, DW, W, W, W, SW, SW, SW, D, D, D, R],
        [R, D, D, D, SW, SW, SW, W, W, W, W, W, W, W, W, SW, SW, SW, D, D, D, R],
        [R, D, D, D, D, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, D, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // South side of the bath.
        { id: '63_41_royal_baths', label: 'Royal Baths', col: 10, row: 19, type: 'patrol_point' },
        // North-west corner.
        { id: '63_41_royal_baths_northwest', label: 'Baths North-west', col: 1, row: 1, type: 'enemySpawn' },
        // South-east corner.
        { id: '63_41_royal_baths_southeast', label: 'Baths South-east', col: 20, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_41_center', position: { kind: 'gridPoint', col: 10, row: 19 }, tags: ['castle'] }],
        edges: [
            ['63_42_center', '63_41_center'],
        ],
    },
};
