/**
 * 58_45 West Wall Walk (Murder Holes) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * The murder-hole gallery: the west wall walk doubles back on itself here. Three 2-wide galleries
 * run side by side between 1-wide walls: up the inner one from the sally port, back south along
 * the middle one (murder holes as Gravel), then north again along the curtain (arrow notches)
 * into 58_44. No door into the royal chambers.
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

export const SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES: CastleSegment = {
    id: '58_45_west_wall_walk_murder_holes',
    gridCol: 58,
    gridRow: 45,
    description: 'A stretch of the wall walk over murder holes: openings in the floor that defenders used to drop stones or boiling liquids on attackers below.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, B, B, B, B, B, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, D, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, D, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, G, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, G, G, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, G, G, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, R, R, B, D, D, B, G, G, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, G, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, B, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, D, D, D, D, D, B, D, D, B],
        [_, _, _, _, _, _, _, SW, W, W, B, B, B, B, B, B, B, B, B, D, D, B],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_45_west_walk_murder_holes', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Guard nook east of the walk.
        { id: '58_45_west_walk_murder_nook', label: 'Guard Nook', col: 19, row: 11, type: 'enemySpawn' },
        // Middle gallery.
        { id: '58_45_murder_gallery', label: 'Murder-Hole Gallery', col: 16, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [
            { id: '58_45_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] },
            { id: '58_45_turn_north', position: { kind: 'gridPoint', col: 18, row: 1 }, tags: ['castle'] },
            { id: '58_45_turn_south', position: { kind: 'gridPoint', col: 15, row: 19 }, tags: ['castle'] },
        ],
        edges: [
            ['58_44_center', '58_45_center'],
            ['58_45_center', '58_45_turn_south'],
            ['58_45_turn_south', '58_45_turn_north'],
        ],
    },
};
