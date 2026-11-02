/**
 * 63_45 Overgrown Orchard - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-east quarter of the castle garden: staggered fruit trees (rock trunks) in thick
 * undergrowth. 2-wide door south to the chapel altar.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_63_45_ORCHARD: CastleSegment = {
    id: '63_45_orchard',
    gridCol: 63,
    gridRow: 45,
    description: 'Fruit trees grown within the walls as a food supply. This one has been left to grow wild.',
    terrain: [
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, _, T, T, T, R],
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, T, T, T, T, T, R],
        [W, W, W, W, W, W, SW, SW, SW, _, _, D, D, _, _, _, T, T, T, T, T, R],
        [W, W, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, T, T, T, T, T, R],
        [W, W, W, W, W, SW, SW, T, T, T, D, D, T, T, _, T, T, T, T, _, _, R],
        [W, W, W, SW, SW, SW, SW, T, R, D, D, D, R, T, _, T, R, T, _, _, _, R],
        [SW, SW, SW, SW, SW, _, _, T, D, D, D, D, T, T, _, T, T, T, _, _, _, R],
        [SW, SW, SW, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, _, _, _, R],
        [_, _, _, _, _, T, D, D, D, T, D, D, _, T, T, T, _, T, T, T, _, R],
        [_, _, _, D, D, D, D, D, _, T, D, D, _, T, R, T, _, T, R, T, _, R],
        [D, D, D, D, D, D, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, R],
        [D, D, D, D, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [_, _, _, T, T, T, _, T, T, T, D, D, T, T, _, T, T, T, _, _, _, R],
        [_, _, _, T, R, T, _, T, R, T, D, D, R, T, _, T, R, T, _, _, _, R],
        [_, _, _, T, T, T, _, T, T, T, D, D, T, T, _, T, T, T, _, _, _, R],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [_, _, _, _, _, T, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, R],
        [_, _, _, _, _, T, R, T, _, T, D, D, _, T, R, T, _, T, R, T, _, R],
        [T, T, T, T, T, T, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, R],
        [T, T, T, T, T, T, T, T, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [T, T, T, T, T, T, T, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '63_45_garden_loop_se', label: 'Garden Loop (South-east)', col: 9, row: 8, type: 'patrol_point' },
        // In the undergrowth between the trees.
        { id: '63_45_orchard_trees', label: 'Among the Trees', col: 16, row: 14, type: 'enemySpawn' },
        // South-west corner of the orchard.
        { id: '63_45_orchard_corner', label: 'Orchard Corner', col: 5, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_45_center', position: { kind: 'gridPoint', col: 9, row: 8 }, tags: ['castle'] }],
        edges: [],
    },
};
