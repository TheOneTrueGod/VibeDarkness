/**
 * 58_49 Woodshed - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Long room inside the south wall with wood piles (Thick Grass) and chopping blocks.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_58_49_WOODSHED: CastleSegment = {
    id: '58_49_woodshed',
    gridCol: 58,
    gridRow: 49,
    description: "Stacked firewood for the castle's hearths and ovens. A castle burned huge amounts of wood, especially through winter.",
    terrain: [
        [R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, T, T, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, R, D, T, T, T, T, T, T, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, T, T, T, T, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, T, T, T, T, T, T, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // Middle of the woodshed.
        { id: '58_49_woodshed', label: 'Woodshed', col: 10, row: 5, type: 'patrol_point' },
        // Behind the east wood piles.
        { id: '58_49_woodshed_piles', label: 'Wood Piles', col: 17, row: 7, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_49_center', position: { kind: 'gridPoint', col: 10, row: 5 }, tags: ['castle'] }],
        edges: [
            ['58_48_center', '58_49_center'],
            ['59_49_center', '58_49_center'],
        ],
    },
};
