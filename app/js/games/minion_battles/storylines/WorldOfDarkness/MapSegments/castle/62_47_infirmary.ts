/**
 * 62_47 Infirmary - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Rows of beds, a herbal bath, and a walled quarantine ward.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_62_47_INFIRMARY: CastleSegment = {
    id: '62_47_infirmary',
    gridCol: 62,
    gridRow: 47,
    description: 'A sickroom where the wounded and ill were tended, usually by clergy using herbal remedies.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, R, D, D, R, D, D, R, D, D, D, D, R, D, D, R, D, D, R, D, R],
        [R, D, R, D, D, R, D, D, R, D, D, D, D, R, D, D, R, D, D, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, SW, SW, SW, SW, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, R, D, D, R, D, D, D, D, R, D, D, R, D, D, R, D, R],
        [R, D, D, D, D, R, D, D, R, D, D, D, D, R, D, D, R, D, D, R, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Ward floor.
        { id: '62_47_infirmary', label: 'Infirmary', col: 10, row: 10, type: 'patrol_point' },
        // Inside the quarantine ward.
        { id: '62_47_infirmary_quarantine', label: 'Quarantine Ward', col: 17, row: 10, type: 'enemySpawn' },
        // By the south beds.
        { id: '62_47_infirmary_beds', label: 'Infirmary Beds', col: 3, row: 15, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_47_center', '62_47_center'],
            ['62_46_center', '62_47_center'],
        ],
    },
};
