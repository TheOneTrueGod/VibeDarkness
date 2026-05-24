/**
 * 50_51 South gate — stretch south under the cave; draws players toward Lanternite patrol light.
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_51_SOUTH_GATE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, _, D, D, _, R, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, R, R, R, R, R, R, R],
    [_, _, T, T, _, _, _, _, D, D, D, _, _, T, T, _, R, R, R, R, R, R],
    [_, _, T, T, T, _, _, D, D, D, _, _, _, T, T, _, R, R, R, R, R, R],
    [_, _, _, T, T, _, _, D, D, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, _, D, D, _, _, _, _, _, T, T, T, R, R, R, R, R],
    [_, R, R, _, _, _, D, D, D, _, _, _, _, _, T, T, T, R, R, R, R, R],
    [_, R, R, _, _, D, D, D, D, D, _, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, D, D, D, D, D, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [D, D, D, D, D, _, _, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, R, R, _, D, D, _, _, T, _, _, _, R, R, R, R, R],
    [_, _, _, _, _, _, R, R, _, D, D, _, _, T, T, T, _, R, R, R, R, R],
    [_, _, _, T, T, _, _, _, _, D, D, _, _, T, T, T, _, R, R, R, R, R],
    [_, _, T, T, T, _, _, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R],
    [_, _, T, T, _, _, _, _, _, D, D, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, T, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R, R],
];

/** Where Lanternites first read as movement + light breadcrumbs (segment-local). */
export const PATROL_DRAW_POINT = { col: 16, row: 11 } as const;
