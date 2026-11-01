/**
 * 63_45 Flooded Crypt - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Crypt flooded with shallow water (half speed) around rows of sarcophagi, with a deeper pool and
 * a dry dais to the north.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_63_45_FLOODED_CRYPT: CastleSegment = {
    id: '63_45_flooded_crypt',
    gridCol: 63,
    gridRow: 45,
    description: 'A crypt is a burial vault beneath a chapel, used for clergy and nobles. This one has flooded with groundwater.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, R],
        [D, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [D, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, R, SW, SW, SW, R, SW, W, W, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, W, W, W, W, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, W, W, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, SW, R, SW, SW, SW, R, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, R],
        [R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Dry dais.
        { id: '63_45_crypt_dais', label: 'Crypt Dais', col: 10, row: 2, type: 'patrol_point' },
        // Among the south-west sarcophagi.
        { id: '63_45_crypt_southwest', label: 'Crypt South-west', col: 2, row: 18, type: 'enemySpawn' },
        // Among the south-east sarcophagi.
        { id: '63_45_crypt_southeast', label: 'Crypt South-east', col: 19, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_45_center', position: { kind: 'gridPoint', col: 10, row: 2 }, tags: ['castle'] }],
        edges: [
            ['62_45_center', '63_45_center'],
            ['63_44_center', '63_45_center'],
        ],
    },
};
