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
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _],
    [_, _, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _],
    [_, _, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, T, T, _, _, _, _, T, T, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, T, T, _, _, _, T, T, T, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, T, T, _, _, _, _, _, _, _, _],
    [_, _, _, _, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, T, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, T, T, _, _, _, _, _, _, D, D, D, D, D, D, D, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _],
    [_, _, _, _, _, _, _, D, D, D, D, D, _, _, _, _, D, D, D, D, D, D],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, _, _, _, D, D, D],
    [_, _, _, _, _, D, D, D, D, D, _, _, _, _, _, _, T, T, _, _, _, _],
    [_, _, T, T, _, D, D, D, D, D, _, T, T, _, _, _, T, T, T, _, _, _],
    [_, _, T, T, _, D, D, D, D, D, _, T, T, _, _, _, _, T, T, _, _, _],
    [_, T, T, _, _, D, D, D, D, D, _, _, _, _, R, R, _, _, _, _, _, _],
    [_, T, T, _, _, _, _, _, _, _, _, _, _, _, R, R, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
];

/** Clearing focus for Lanternite mound placement (segment-local grid coords). */
export const LANTERN_NEST_FOCUS = { col: 7, row: 15 } as const;
