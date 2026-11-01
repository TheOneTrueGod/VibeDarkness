/**
 * 58_44 Prison Cells - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Cell block: a 4-wide corridor with four cells on each side behind 1-wide doors. Dead end off the
 * upper west wing.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_58_44_PRISON_CELLS: CastleSegment = {
    id: '58_44_prison_cells',
    gridCol: 58,
    gridRow: 44,
    description: 'Rows of small locked cells holding prisoners awaiting trial, ransom or punishment.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Cell block corridor.
        { id: '58_44_cellblock', label: 'Cell Block', col: 10, row: 12, type: 'patrol_point' },
        // A west cell.
        { id: '58_44_cellblock_west_cell', label: 'West Cell', col: 4, row: 8, type: 'enemySpawn' },
        // An east cell.
        { id: '58_44_cellblock_east_cell', label: 'East Cell', col: 17, row: 13, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '58_44_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [],
    },
};
