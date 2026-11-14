/**
 * 60_43 North Stair Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Stair landing inside the north wall; a stair core blocks the middle. Its old stair down to the
 * royal chambers is walled up (they are reached only from the west wall walk).
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

export const SEGMENT_60_43_NORTH_STAIR_TOWER: CastleSegment = {
    id: '60_43_north_stair_tower',
    gridCol: 60,
    gridRow: 43,
    description: 'A tower holding a spiral stair between the wall walk and the inner rooms. Such stairs usually turned clockwise going up, which favoured right-handed defenders.',
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
        [B, B, B, B, R, R, R, R, R, R, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, R, R, R, R, R, R, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, R, R, R, R, R, R, B, B, B, B, G, B, B, B, B, B, B, B],
        [B, G, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, G, B],
        [B, D, D, D, B, D, B, B, D, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, D, G, G, B, B, D, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, G, G, G, B, B, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, D, G, G, G, G, B, B, G, D, D, D, G, G, G, G, B, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Stair landing.
        { id: '60_43_north_stair', label: 'North Stair', col: 10, row: 16, type: 'patrol_point' },
        // East corner.
        { id: '60_43_north_stair_corner', label: 'Stair Corner', col: 19, row: 14, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_43_center', position: { kind: 'gridPoint', col: 10, row: 16 }, tags: ['castle'] }],
        edges: [
            ['59_43_center', '60_43_center'],
        ],
    },
};
