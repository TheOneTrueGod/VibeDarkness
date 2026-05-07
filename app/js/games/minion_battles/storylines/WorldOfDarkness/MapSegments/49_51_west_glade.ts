/**
 * 49_51 West glade — opening west of the south gate (Lanternites / nest anchor).
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_49_51_WEST_GLADE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [_, _, R, R, _, _, _, _, R, R, R, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, R, R, _, _, T, T, T, R, _, _, _, _, _, _],
    [T, _, T, T, _, _, _, _, _, _, _, _, T, _, R, R, _, _, R, R, _, _],
    [T, T, _, _, _, _, _, _, _, _, _, _, _, _, R, _, _, _, R, _, _, _],
    [D, _, _, _, R, R, _, _, _, D, D, D, _, _, _, _, _, _, _, _, _, _],
    [_, D, D, _, _, _, R, D, D, _, _, _, D, _, _, _, _, _, _, _, _, _],
    [_, _, _, D, D, D, D, _, _, _, _, _, _, D, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, R, R, _, _, D, D, D, D, D, D, D, _],
    [_, _, _, _, _, _, _, T, _, _, _, R, R, _, D, D, D, D, D, D, D, D],
    [_, R, _, _, _, T, T, T, T, T, _, _, _, _, D, _, _, _, _, _, _, D],
    [R, R, R, R, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _],
    [R, R, _, _, _, _, _, _, _, D, D, D, _, _, T, T, _, _, _, _, _, _],
    [R, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R, R, _, _, _, _],
    [_, _, D, D, D, _, _, _, _, _, T, _, T, _, _, _, R, R, R, _, _, _],
    [D, D, _, _, _, _, _, _, _, _, T, T, T, _, _, _, _, _, _, _, T, _],
    [_, _, _, _, _, _, _, R, R, R, T, T, T, _, R, _, _, _, _, _, _, T],
    [_, _, _, _, _, _, _, R, R, _, T, T, T, R, R, _, _, _, _, _, _, _],
    [_, _, _, R, R, R, R, R, _, _, _, _, _, _, R, R, _, _, _, _, _, _],
    [_, _, R, R, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R]
];

/** Clearing focus for Lanternite mound placement (segment-local grid coords). */
export const LANTERN_NEST_FOCUS = { col: 13, row: 13 } as const;
