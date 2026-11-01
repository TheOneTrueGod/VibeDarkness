/**
 * 59_40 North Stair Tower - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Stair landing inside the north wall where the royal guard hall reaches the wall walk; a stair
 * core blocks the middle.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_59_40_NORTH_STAIR_TOWER: CastleSegment = {
    id: '59_40_north_stair_tower',
    gridCol: 59,
    gridRow: 40,
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
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, R, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, R, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Stair landing.
        { id: '59_40_north_stair', label: 'North Stair', col: 10, row: 16, type: 'patrol_point' },
        // East corner.
        { id: '59_40_north_stair_corner', label: 'Stair Corner', col: 19, row: 14, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_40_center', position: { kind: 'gridPoint', col: 10, row: 16 }, tags: ['castle'] }],
        edges: [
            ['59_41_center', '59_40_center'],
            ['58_40_center', '59_40_center'],
        ],
    },
};
