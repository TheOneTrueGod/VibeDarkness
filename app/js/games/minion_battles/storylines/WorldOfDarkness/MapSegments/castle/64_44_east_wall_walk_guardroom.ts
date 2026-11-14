/**
 * 64_44 East Wall Walk (Guard Room) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Top of the winding east wall walk (the mirror of 58_44). The gallery from 64_45 comes up the
 * outer side into a guard room with a 2-wide door west into the alchemy lab: the only way into
 * the wizard's tower. A 2-wide stair climbs north to the north-east tower; a guards' bunk room
 * opens off the gallery.
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

export const SEGMENT_64_44_EAST_WALL_WALK_GUARDROOM: CastleSegment = {
    id: '64_44_east_wall_walk_guardroom',
    gridCol: 64,
    gridRow: 44,
    description: 'A stretch of the wall walk with a guard room, where sentries sheltered from the weather and rested between watches.',
    terrain: [
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, G, D, D, D, D, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, G, D, D, D, D, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, D, D, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, G, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, G, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, G, G, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, G, G, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, G, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, B, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, B, D, D, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, B, D, D, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, G, G, G, G, G, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, B, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, B, B, B, B, B, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '64_44_east_walk_guardroom', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
        // Guard room.
        { id: '64_44_east_walk_guardroom_room', label: 'Wall Guard Room', col: 2, row: 12, type: 'enemySpawn' },
        // Bunk room off the gallery.
        { id: '64_44_guard_bunks', label: 'Guard Bunk Room', col: 3, row: 16, type: 'enemySpawn' },
        // At the door into the alchemy lab: where the east-wall-walk mission ends.
        { id: '64_44_exit_west', label: 'Exit: West', col: 1, row: 10, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '64_44_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_43_center', '64_44_center'],
        ],
    },
};
