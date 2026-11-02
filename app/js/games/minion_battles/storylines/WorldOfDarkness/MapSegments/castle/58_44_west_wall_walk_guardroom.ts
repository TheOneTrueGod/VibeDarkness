/**
 * 58_44 West Wall Walk (Guard Room) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with a guard room that opens east into the royal bedchamber, buttresses and arrow
 * notches.
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

export const SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM: CastleSegment = {
    id: '58_44_west_wall_walk_guardroom',
    gridCol: 58,
    gridRow: 44,
    description: 'A stretch of the wall walk with a guard room, where sentries sheltered from the weather and rested between watches.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_44_west_walk_guardroom', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Guard room.
        { id: '58_44_west_walk_guardroom_room', label: 'Wall Guard Room', col: 19, row: 12, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_44_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_43_center', '58_44_center'],
        ],
    },
};
