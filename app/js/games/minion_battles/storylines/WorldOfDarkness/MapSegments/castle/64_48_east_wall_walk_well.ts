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
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, W, W, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, W, W, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, W, W, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [D, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
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
