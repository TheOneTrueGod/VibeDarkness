/**
 * 62_47 Queen's Garden - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-west quarter of the castle garden (62-63 x 47-48, painted as one space round a central
 * pond): a fountain inside an L of hedges and flower beds. 3-wide opening west to the crossroads'
 * east road (61_47).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const DW = TerrainType.DeepWater;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const T = TerrainType.ThickGrass;
const W = TerrainType.Water;

export const SEGMENT_62_47_QUEENS_GARDEN: CastleSegment = {
    id: '62_47_queens_garden',
    gridCol: 62,
    gridRow: 47,
    description: 'A walled private garden for the royal family, with paths, flower beds and a fountain, for leisure away from the court.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, T, T, T, T, T, T, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, T, _, _, T, T, T, T, T, T, T],
        [B, _, _, _, _, _, _, _, _, _, D, D, T, _, _, _, _, _, _, T, T, T],
        [B, _, _, _, _, _, _, _, _, _, D, D, T, _, _, _, _, _, _, _, T, T],
        [B, _, _, _, _, _, R, R, R, _, D, D, T, _, _, _, _, _, _, _, _, _],
        [B, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [B, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [B, _, _, _, _, R, W, W, W, R, D, D, T, _, _, _, _, _, _, _, _, _],
        [D, D, D, D, _, _, R, R, R, _, D, D, _, _, _, _, _, _, _, _, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, D, D, D, D, D, D],
        [B, _, T, T, T, T, T, T, T, _, D, D, _, _, D, D, D, D, D, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, D, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, SW, SW, SW],
        [B, _, _, _, _, _, _, _, _, _, D, D, D, D, _, _, _, SW, SW, SW, SW, SW],
        [B, T, T, _, _, _, _, _, _, _, D, D, D, _, _, SW, SW, SW, SW, W, W, W],
        [B, T, T, _, _, _, _, _, _, _, D, D, _, _, _, SW, SW, W, W, W, W, W],
        [B, T, T, _, _, _, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, W, W],
        [B, T, T, T, _, _, _, _, _, D, D, _, _, SW, SW, SW, W, W, W, W, W, W],
        [B, T, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
        [B, _, T, T, T, _, _, _, _, D, D, _, _, SW, SW, W, W, W, W, DW, DW, DW],
    ],
    pointsOfInterest: [
        // On the loop path round the pond.
        { id: '62_47_garden_loop_nw', label: 'Garden Loop (North-west)', col: 13, row: 14, type: 'patrol_point' },
        // South of the fountain, inside the hedges.
        { id: '62_47_fountain', label: 'Fountain', col: 7, row: 11, type: 'generic' },
        // West of the hedge line.
        { id: '62_47_hedges', label: 'Behind the Hedges', col: 4, row: 16, type: 'enemySpawn' },
        // Just inside the opening from the crossroads: where the garden-heart mission starts.
        { id: '62_47_entry_west', label: 'Entry: West', col: 2, row: 10, type: 'generic', tags: ['entry'] },
        // On the loop path north of the pond, mid-way along the north half of the garden: the boss spot.
        { id: '62_47_boss', label: 'Garden Heart', col: 19, row: 11, type: 'generic', tags: ['boss'] },
    ],
    network: {
        nodes: [{ id: '62_47_center', position: { kind: 'gridPoint', col: 13, row: 14 }, tags: ['castle'] }],
        edges: [
            ['61_47_center', '62_47_center'],
            ['62_47_center', '63_47_center'],
            ['62_47_center', '62_48_center'],
        ],
    },
};
