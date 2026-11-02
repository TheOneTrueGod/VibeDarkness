/**
 * 59_43 North Wall Walk (West) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A 5-wide walk inside the north curtain wall with arrow notches and a guard nook.
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

export const SEGMENT_59_43_NORTH_WALL_WALK_WEST: CastleSegment = {
    id: '59_43_north_wall_walk_west',
    gridCol: 59,
    gridRow: 43,
    description: 'The wall walk is the path along the top of the curtain wall, behind its battlements. Sentries patrolled it, and defenders fought from it during a siege.',
    terrain: [
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, G, R, R, R, R, G, R, R, R, R, G, R, R, R, R, R, R],
        [R, R, R, R, R, G, R, R, R, R, G, R, R, R, R, G, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, R, G, G, G, G, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, G, G, R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, R],
        [R, R, R, R, R, R, R, R, R, G, G, G, G, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, G, G, G, G, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '59_43_north_walk_west', label: 'North Wall Walk', col: 10, row: 16, type: 'patrol_point' },
        // Guard nook.
        { id: '59_43_north_walk_west_nook', label: 'Guard Nook', col: 10, row: 20, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_43_center', position: { kind: 'gridPoint', col: 10, row: 16 }, tags: ['castle'] }],
        edges: [
            ['58_43_center', '59_43_center'],
        ],
    },
};
