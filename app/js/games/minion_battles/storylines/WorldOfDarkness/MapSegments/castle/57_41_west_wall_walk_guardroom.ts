/**
 * 57_41 West Wall Walk (Guard Room) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with a guard room that opens east to the watch hall, buttresses and arrow
 * notches.
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

export const SEGMENT_57_41_WEST_WALL_WALK_GUARDROOM: CastleSegment = {
    id: '57_41_west_wall_walk_guardroom',
    gridCol: 57,
    gridRow: 41,
    description: 'A stretch of the wall walk with a guard room, where sentries sheltered from the weather and rested between watches.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, D, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, D, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '57_41_west_walk_guardroom', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Guard room.
        { id: '57_41_west_walk_guardroom_room', label: 'Wall Guard Room', col: 19, row: 12, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '57_41_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_41_center', '57_41_center'],
            ['57_40_center', '57_41_center'],
        ],
    },
};
