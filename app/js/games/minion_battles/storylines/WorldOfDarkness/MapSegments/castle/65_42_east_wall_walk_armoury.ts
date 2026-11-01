/**
 * 65_42 East Wall Walk (Armoury Nook) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East wall walk with a weapons nook and a storage nook.
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

export const SEGMENT_65_42_EAST_WALL_WALK_ARMOURY: CastleSegment = {
    id: '65_42_east_wall_walk_armoury',
    gridCol: 65,
    gridRow: 42,
    description: 'A stretch of the wall walk with an armoury nook, where spare arrows and weapons were kept ready for the defenders on the wall.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '65_42_east_walk_armoury', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '65_42_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['65_41_center', '65_42_center'],
        ],
    },
};
