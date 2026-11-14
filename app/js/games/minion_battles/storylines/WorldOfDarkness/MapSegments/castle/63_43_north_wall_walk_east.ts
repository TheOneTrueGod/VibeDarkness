/**
 * 63_43 North Wall Walk (East) - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A 5-wide walk inside the north curtain wall with arrow notches and a guard nook (mirror of the
 * west half).
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

export const SEGMENT_63_43_NORTH_WALL_WALK_EAST: CastleSegment = {
    id: '63_43_north_wall_walk_east',
    gridCol: 63,
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
        [B, B, B, B, B, B, B, B, R, R, R, R, R, R, R, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, R, R, R, R, R, R, R, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, G, B, R, R, R, G, R, R, R, B, G, B, B, B, B, B],
        [B, B, B, B, B, B, G, B, B, B, B, G, B, B, B, B, G, B, B, B, B, B],
        [B, G, G, G, G, B, G, G, G, G, G, G, R, G, G, G, G, G, G, G, G, B],
        [B, D, D, D, D, D, D, D, D, D, D, D, G, D, D, D, D, D, D, D, D, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, D, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B, G, G, D, B],
        [B, B, B, B, B, B, B, B, B, G, G, G, G, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, B, G, G, G, G, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the wall walk.
        { id: '63_43_north_walk_east', label: 'North Wall Walk', col: 11, row: 16, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '63_43_center', position: { kind: 'gridPoint', col: 11, row: 16 }, tags: ['castle'] }],
        edges: [
            ['64_43_center', '63_43_center'],
        ],
    },
};
