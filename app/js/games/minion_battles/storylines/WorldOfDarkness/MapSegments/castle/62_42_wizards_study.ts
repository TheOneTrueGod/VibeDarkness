/**
 * 62_42 Wizard's Study - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Bookshelves, a desk and a sunken scrying pool.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_62_42_WIZARDS_STUDY: CastleSegment = {
    id: '62_42_wizards_study',
    gridCol: 62,
    gridRow: 42,
    description: 'The private study of the court wizard, with books, instruments and a workbench for magical research.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, R, R, R, R, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, R, R, R, R, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, D, D, SW, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, SW, W, W, W, SW, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, SW, SW, W, W, W, SW, SW, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, SW, W, W, W, SW, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, D, D, SW, D, D, D, D, D, D, R],
        [R, D, D, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Study floor.
        { id: '62_42_wizards_study', label: 'Wizard\'s Study', col: 10, row: 10, type: 'patrol_point' },
        // North of the scrying pool.
        { id: '62_42_scrying_pool', label: 'Scrying Pool', col: 14, row: 10, type: 'generic' },
        // Behind the west shelves.
        { id: '62_42_wizards_study_shelves', label: 'Study Shelves', col: 2, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_42_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['62_43_center', '62_42_center'],
        ],
    },
};
