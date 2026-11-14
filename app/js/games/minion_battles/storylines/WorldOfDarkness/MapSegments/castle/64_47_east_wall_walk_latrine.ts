/**
 * 64_47 East Wall Walk (Latrine) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East wall walk with a latrine nook (mirror of the west walk).
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

export const SEGMENT_64_47_EAST_WALL_WALK_LATRINE: CastleSegment = {
    id: '64_47_east_wall_walk_latrine',
    gridCol: 64,
    gridRow: 47,
    description: 'A stretch of the wall walk with a garderobe: a small latrine whose seat sat over a chute that emptied down the outside of the wall.',
    terrain: [
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, D, D, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, G, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, G, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, B, G, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, B, G, D, D, G, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, B, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '64_47_east_walk_latrine', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '64_47_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_46_center', '64_47_center'],
        ],
    },
};
