/**
 * 62_44 Queen's Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-west quarter of the castle garden (62-63 x 44-45, painted as one space round a central
 * pond): a fountain inside an L of hedges and flower beds. 1-wide door west to the throne room,
 * 2-wide door north to the observatory.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_62_44_QUEENS_GARDEN: CastleSegment = {
    id: '62_44_queens_garden',
    gridCol: 62,
    gridRow: 44,
    description: 'A walled private garden for the royal family, with paths, flower beds and a fountain, for leisure away from the court.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, T, T, T, T, T, T, _],
        [R, _, _, _, _, _, _, _, _, _, D, D, T, _, _, T, T, T, T, T, T, T],
        [R, _, _, _, _, _, _, _, _, _, D, D, T, _, _, _, _, _, _, T, T, T],
        [R, _, _, _, _, _, _, _, _, _, D, D, T, _, _, _, _, _, _, _, T, T],
        [R, _, _, _, _, _, R, R, R, _, D, D, T, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, R, R, R, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, D, D, D, D],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, D, D, D, D, D, D],
        [R, _, T, T, T, T, T, T, T, _, D, D, _, _, D, D, D, D, D, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, D, D, _, D, D, D, _, _, _, _, _, _],
        [R, _, _, _, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, SW, SW, SW],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, SW, SW, SW, SW, SW],
        [R, T, T, _, _, _, _, _, _, _, D, D, D, _, _, SW, SW, SW, SW, W, W, W],
        [R, T, T, _, _, _, _, _, _, _, D, D, _, _, _, SW, SW, W, W, W, W, W],
        [R, T, T, _, _, _, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, W, W],
        [R, T, T, T, _, _, _, _, _, D, D, _, _, SW, SW, SW, W, W, W, W, W, W],
        [R, T, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [R, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '62_44_garden_loop_nw', label: 'Garden Loop (North-west)', col: 13, row: 14, type: 'patrol_point' },
        // South of the fountain, inside the hedges.
        { id: '62_44_fountain', label: 'Fountain', col: 7, row: 11, type: 'generic' },
        // West of the hedge line.
        { id: '62_44_hedges', label: 'Behind the Hedges', col: 4, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_44_center', position: { kind: 'gridPoint', col: 13, row: 14 }, tags: ['castle'] }],
        edges: [
            ['61_44_center', '62_44_center'],
            ['62_43_center', '62_44_center'],
        ],
    },
};
