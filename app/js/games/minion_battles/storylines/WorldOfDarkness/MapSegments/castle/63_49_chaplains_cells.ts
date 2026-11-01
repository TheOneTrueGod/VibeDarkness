/**
 * 63_49 Chaplain's Cells - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Row of small prayer cells along the north side of a long room inside the south wall, and a long
 * pew.
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

export const SEGMENT_63_49_CHAPLAINS_CELLS: CastleSegment = {
    id: '63_49_chaplains_cells',
    gridCol: 63,
    gridRow: 49,
    description: "Small, plain rooms where the chaplain and other clergy lived. A cell here means a monk's bare bedroom, not a prison.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, R, D, D, D, R, D, D, D, D, R, D, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, D, R, D, D, D, D, R, D, D, D, R, D, D, D, R],
        [R, D, D, D, R, D, D, D, R, D, D, D, D, R, D, D, D, R, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // Long room.
        { id: '63_49_chaplains_cells', label: 'Chaplain\'s Cells', col: 10, row: 5, type: 'patrol_point' },
        // A prayer cell.
        { id: '63_49_chaplains_cell', label: 'Prayer Cell', col: 6, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_49_center', position: { kind: 'gridPoint', col: 10, row: 5 }, tags: ['castle'] }],
        edges: [
            ['63_48_center', '63_49_center'],
            ['62_49_center', '63_49_center'],
        ],
    },
};
