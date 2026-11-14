/**
 * 64_45 East Wall Walk (Murder Holes) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The murder-hole gallery of the east wall walk (the mirror of 58_45): three 2-wide galleries side
 * by side, so the walk doubles back on itself. A collapsed stretch of the curtain's outer face is
 * natural Rock. No door into the wizard's tower.
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

export const SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES: CastleSegment = {
    id: '64_45_east_wall_walk_murder_holes',
    gridCol: 64,
    gridRow: 45,
    description: 'A stretch of the wall walk over murder holes: openings in the floor that defenders used to drop stones or boiling liquids on attackers below.',
    terrain: [
        [B, B, B, B, B, B, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, D, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, D, D, D, B, D, D, B, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, G, G, B, D, D, B, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, G, G, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, G, G, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, G, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, B, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, D, D, D, D, D, B, B, B, W, W, SW, _, _, _, _, _, _, _],
        [B, D, D, B, B, B, B, B, B, B, B, B, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '64_45_east_walk_murder_holes', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
        // Guard nook west of the walk.
        { id: '64_45_east_walk_murder_nook', label: 'Guard Nook', col: 2, row: 11, type: 'enemySpawn' },
        // Middle gallery.
        { id: '64_45_murder_gallery', label: 'Murder-Hole Gallery', col: 5, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [
            { id: '64_45_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] },
            { id: '64_45_turn_north', position: { kind: 'gridPoint', col: 3, row: 1 }, tags: ['castle'] },
            { id: '64_45_turn_south', position: { kind: 'gridPoint', col: 6, row: 19 }, tags: ['castle'] },
        ],
        edges: [
            ['64_44_center', '64_45_center'],
            ['64_45_center', '64_45_turn_south'],
            ['64_45_turn_south', '64_45_turn_north'],
        ],
    },
};
