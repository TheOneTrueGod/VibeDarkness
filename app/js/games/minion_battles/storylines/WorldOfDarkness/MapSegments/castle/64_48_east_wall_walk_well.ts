/**
 * 64_48 East Wall Walk (Well) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East wall walk with a well room.
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

export const SEGMENT_64_48_EAST_WALL_WALK_WELL: CastleSegment = {
    id: '64_48_east_wall_walk_well',
    gridCol: 64,
    gridRow: 48,
    description: 'A stretch of the wall walk around a well. A water source inside the walls was essential to surviving a long siege.',
    terrain: [
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, G, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, B, G, D, G, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, B, G, D, D, G, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, W, W, D, B, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, W, W, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, W, W, D, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, D, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, D, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, G, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '64_48_east_walk_well', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '64_48_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_47_center', '64_48_center'],
        ],
    },
};
