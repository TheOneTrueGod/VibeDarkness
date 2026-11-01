/**
 * 57_42 West Wall Walk (Armoury Nook) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with a weapons nook and a storage nook.
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

export const SEGMENT_57_42_WEST_WALL_WALK_ARMOURY: CastleSegment = {
    id: '57_42_west_wall_walk_armoury',
    gridCol: 57,
    gridRow: 42,
    description: 'A stretch of the wall walk with an armoury nook, where spare arrows and weapons were kept ready for the defenders on the wall.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '57_42_west_walk_armoury', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Weapons nook.
        { id: '57_42_west_walk_armoury_nook', label: 'Weapons Nook', col: 19, row: 5, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '57_42_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['57_41_center', '57_42_center'],
        ],
    },
};
