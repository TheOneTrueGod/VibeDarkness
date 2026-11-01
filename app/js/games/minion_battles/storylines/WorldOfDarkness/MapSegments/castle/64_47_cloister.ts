/**
 * 64_47 Cloister - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Open-air cloister: a walkway round a grass garth with a colonnade, flower beds and a central
 * fountain.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_64_47_CLOISTER: CastleSegment = {
    id: '64_47_cloister',
    gridCol: 64,
    gridRow: 47,
    description: 'A covered walkway around an open garden square, used by the clergy for walking, reading and quiet prayer.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, D, R, D, D, D, D, D, D, R, D, D, D, R, D, D, R],
        [R, D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, R],
        [R, D, D, D, _, T, T, T, _, _, _, _, _, _, T, T, T, _, D, D, D, R],
        [R, D, D, D, _, T, T, T, _, _, _, _, _, _, T, T, T, _, D, D, D, R],
        [R, D, D, R, _, T, T, T, _, _, _, _, _, _, T, T, T, _, R, D, D, R],
        [R, D, D, D, _, _, _, _, _, _, SW, SW, _, _, _, _, _, _, D, D, D, R],
        [R, D, D, D, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, D, D, D, R],
        [D, D, D, D, _, _, _, _, SW, SW, W, W, SW, SW, _, _, _, _, D, D, D, R],
        [D, D, D, D, _, _, _, _, SW, SW, W, W, SW, SW, _, _, _, _, D, D, D, R],
        [R, D, D, D, _, _, _, _, _, SW, SW, SW, SW, _, _, _, _, _, D, D, D, R],
        [R, D, D, D, _, _, _, _, _, _, SW, SW, _, _, _, _, _, _, D, D, D, R],
        [R, D, D, R, _, T, T, T, _, _, _, _, _, _, T, T, T, _, R, D, D, R],
        [R, D, D, D, _, T, T, T, _, _, _, _, _, _, T, T, T, _, D, D, D, D],
        [R, D, D, D, _, T, T, T, _, _, _, _, _, _, T, T, T, _, D, D, D, R],
        [R, D, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, R],
        [R, D, D, R, D, D, D, R, D, D, D, D, D, D, R, D, D, D, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North of the fountain.
        { id: '64_47_cloister_fountain', label: 'Cloister Fountain', col: 10, row: 7, type: 'generic' },
        // South of the fountain.
        { id: '64_47_cloister_garth', label: 'Cloister Garth', col: 10, row: 14, type: 'patrol_point' },
        // North-west corner of the walk.
        { id: '64_47_cloister_walk', label: 'Cloister Walk', col: 2, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_47_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [
            ['63_47_center', '64_47_center'],
        ],
    },
};
