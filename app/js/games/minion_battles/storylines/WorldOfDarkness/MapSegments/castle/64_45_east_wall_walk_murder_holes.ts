/**
 * 64_45 East Wall Walk (Murder Holes) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East wall walk with staggered pillars and arrow notches into the curtain wall.
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

export const SEGMENT_64_45_EAST_WALL_WALK_MURDER_HOLES: CastleSegment = {
    id: '64_45_east_wall_walk_murder_holes',
    gridCol: 64,
    gridRow: 45,
    description: 'A stretch of the wall walk over murder holes: openings in the floor that defenders used to drop stones or boiling liquids on attackers below.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, R, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, G, G, D, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, G, G, G, R, G, D, D, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, R, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, G, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, G, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '64_45_east_walk_murder_holes', label: 'East Wall Walk', col: 7, row: 10, type: 'patrol_point' },
        // Guard nook west of the walk.
        { id: '64_45_east_walk_murder_nook', label: 'Guard Nook', col: 2, row: 11, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_45_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['64_44_center', '64_45_center'],
        ],
    },
};
