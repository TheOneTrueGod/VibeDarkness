/**
 * 58_44 West Wall Walk (Guard Room) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Top of the winding west wall walk. The gallery from 58_45 comes up the outer side (2 wide,
 * arrow notches in the curtain) into a guard room with a 2-wide door east into the master
 * bedroom: the only way into the royal chambers. A 2-wide stair climbs north from the guard room
 * to the north-west tower; a guards' bunk room opens off the gallery.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_58_44_WEST_WALL_WALK_GUARDROOM: CastleSegment = {
    id: '58_44_west_wall_walk_guardroom',
    gridCol: 58,
    gridRow: 44,
    description: 'A stretch of the wall walk with a guard room, where sentries sheltered from the weather and rested between watches.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, G, D, D, D, D, G, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, G, D, D, D, D, G, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, D, D, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, G, G, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, G, G, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, G, G, G, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, G, G, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, G, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, B, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, G, D, D, B, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, G, D, D, B, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, G, G, G, G, G, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, B, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_44_west_walk_guardroom', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Guard room.
        { id: '58_44_west_walk_guardroom_room', label: 'Wall Guard Room', col: 19, row: 12, type: 'enemySpawn' },
        // Bunk room off the gallery.
        { id: '58_44_guard_bunks', label: 'Guard Bunk Room', col: 18, row: 16, type: 'enemySpawn' },
        // At the door into the master bedroom: where the west-wall-walk mission ends.
        { id: '58_44_exit_east', label: 'Exit: East', col: 20, row: 10, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '58_44_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_43_center', '58_44_center'],
        ],
    },
};
