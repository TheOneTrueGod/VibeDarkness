/**
 * 63_48 Overgrown Orchard - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-east quarter of the castle garden: staggered fruit trees (rock trunks) in thick
 * undergrowth. 2-wide door south to the ice house.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_63_48_ORCHARD: CastleSegment = {
    id: '63_48_orchard',
    gridCol: 63,
    gridRow: 48,
    description: 'Fruit trees grown within the walls as a food supply. This one has been left to grow wild.',
    terrain: [
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, _, T, T, T, B],
        [DW, DW, DW, W, W, W, W, SW, SW, _, _, D, D, _, _, _, T, T, T, T, T, B],
        [W, W, W, W, W, W, SW, SW, SW, _, _, D, D, _, _, _, T, T, T, T, T, B],
        [W, W, W, W, W, W, SW, SW, _, _, D, D, _, _, _, _, T, T, T, T, T, B],
        [W, W, W, W, W, SW, SW, T, T, T, D, D, T, T, _, T, T, T, T, _, _, B],
        [W, W, W, SW, SW, SW, SW, T, R, D, D, D, R, T, _, T, R, T, _, _, _, B],
        [SW, SW, SW, SW, SW, _, _, T, D, D, D, D, T, T, _, T, T, T, _, _, _, B],
        [SW, SW, SW, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, T, D, D, D, T, D, D, _, T, T, T, _, T, T, T, _, B],
        [_, _, _, D, D, D, D, D, _, T, D, D, _, T, R, T, _, T, R, T, _, B],
        [D, D, D, D, D, D, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, B],
        [D, D, D, D, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, T, T, T, _, T, T, T, D, D, T, T, _, T, T, T, _, _, _, B],
        [_, _, _, T, R, T, _, T, R, T, D, D, R, T, _, T, R, T, _, _, _, B],
        [_, _, _, T, T, T, _, T, T, T, D, D, T, T, _, T, T, T, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, T, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, B],
        [_, _, _, _, _, T, R, T, _, T, D, D, _, T, R, T, _, T, R, T, _, B],
        [T, T, T, T, T, T, T, T, _, T, D, D, _, T, T, T, _, T, T, T, _, B],
        [T, T, T, T, T, T, T, T, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [T, T, T, T, T, T, T, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '63_48_garden_loop_se', label: 'Garden Loop (South-east)', col: 9, row: 8, type: 'patrol_point' },
        // In the undergrowth between the trees.
        { id: '63_48_orchard_trees', label: 'Among the Trees', col: 16, row: 14, type: 'enemySpawn' },
        // South-west corner of the orchard.
        { id: '63_48_orchard_corner', label: 'Orchard Corner', col: 5, row: 18, type: 'enemySpawn' },
        // On the loop path east of the pond, toward the conservatory: where the overgrown-garden mission ends.
        { id: '63_48_exit_north', label: 'Exit: North', col: 11, row: 2, type: 'generic', tags: ['exit'] },
        // Among the fruit trees: an explore spot for the Forage the Garden herb-beds mission.
        { id: '63_48_fruit_trees', label: 'Fruit Trees', col: 14, row: 11, type: 'generic', tags: ['explore'] },
        // Beside the ice house door: where the Forage the Garden herb-beds mission ends.
        { id: '63_48_exit_south', label: 'Exit: South', col: 11, row: 20, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '63_48_center', position: { kind: 'gridPoint', col: 9, row: 8 }, tags: ['castle'] }],
        edges: [],
    },
};
