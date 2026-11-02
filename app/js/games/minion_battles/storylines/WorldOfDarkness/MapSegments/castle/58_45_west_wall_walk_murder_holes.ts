/**
 * 58_45 West Wall Walk (Murder Holes) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * West wall walk with staggered pillars and 1-cell arrow notches into the curtain wall; a guard
 * nook to the east.
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

export const SEGMENT_58_45_WEST_WALL_WALK_MURDER_HOLES: CastleSegment = {
    id: '58_45_west_wall_walk_murder_holes',
    gridCol: 58,
    gridRow: 45,
    description: 'A stretch of the wall walk over murder holes: openings in the floor that defenders used to drop stones or boiling liquids on attackers below.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, R, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, G, G, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, D, D, G, R, G, G, G, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, R, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, G, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, G, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '58_45_west_walk_murder_holes', label: 'West Wall Walk', col: 14, row: 10, type: 'patrol_point' },
        // Guard nook east of the walk.
        { id: '58_45_west_walk_murder_nook', label: 'Guard Nook', col: 19, row: 11, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_45_center', position: { kind: 'gridPoint', col: 14, row: 10 }, tags: ['castle'] }],
        edges: [
            ['58_44_center', '58_45_center'],
        ],
    },
};
