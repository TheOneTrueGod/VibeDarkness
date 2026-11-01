/**
 * 65_41 East Wall Walk (Guard Room) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East wall walk with a guard room that opens west to the queen's garden.
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

export const SEGMENT_65_41_EAST_WALL_WALK_GUARDROOM: CastleSegment = {
    id: '65_41_east_wall_walk_guardroom',
    gridCol: 65,
    gridRow: 41,
    description: 'A stretch of the wall walk with a guard room, where sentries sheltered from the weather and rested between watches.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, D, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, D, D, D, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, D, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '65_41_east_walk_guardroom', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
        // Guard room.
        { id: '65_41_east_walk_guardroom_room', label: 'Wall Guard Room', col: 2, row: 12, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '65_41_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_41_center', '65_41_center'],
            ['65_40_center', '65_41_center'],
        ],
    },
};
