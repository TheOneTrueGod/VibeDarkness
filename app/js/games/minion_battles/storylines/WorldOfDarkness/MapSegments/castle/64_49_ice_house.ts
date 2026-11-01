/**
 * 64_49 Ice House - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Cold store inside the south wall with blocks of ice (2x2 rock).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_64_49_ICE_HOUSE: CastleSegment = {
    id: '64_49_ice_house',
    gridCol: 64,
    gridRow: 49,
    description: 'An insulated store packed with winter ice and straw, used to keep food cold through the summer.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
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
        // Middle of the ice house.
        { id: '64_49_ice_house', label: 'Ice House', col: 11, row: 4, type: 'patrol_point' },
        // Behind the ice blocks.
        { id: '64_49_ice_house_blocks', label: 'Ice Blocks', col: 19, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_49_center', position: { kind: 'gridPoint', col: 11, row: 4 }, tags: ['castle'] }],
        edges: [
            ['64_48_center', '64_49_center'],
            ['63_49_center', '64_49_center'],
        ],
    },
};
