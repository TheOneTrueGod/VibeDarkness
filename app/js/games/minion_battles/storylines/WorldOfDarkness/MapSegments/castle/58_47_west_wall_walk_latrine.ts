/**
 * 58_47 West Wall Walk (Latrine) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with a latrine nook. No door into the training ring.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_58_47_WEST_WALL_WALK_LATRINE: CastleSegment = {
    id: '58_47_west_wall_walk_latrine',
    gridCol: 58,
    gridRow: 47,
    description: 'A stretch of the wall walk with a garderobe: a small latrine whose seat sat over a chute that emptied down the outside of the wall.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, G, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, G, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, D, D, G, B, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, B, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, G, B, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_47_west_walk_latrine', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '58_47_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_46_center', '58_47_center'],
        ],
    },
};
