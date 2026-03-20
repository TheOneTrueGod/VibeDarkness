/**
 * 50_50 Crystal Cave - Reusable map segment.
 * Rocky cave (backwards C shape) with opening at left, crystals on right wall.
 * Used in mission 2 (Towards the Light) and mission 3 (Light Empowered).
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_50_CRYSTAL_CAVE: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [_, _, R, R, _, _, R, _, _, R, R, _, _, _, R, R, R, R, R, R, R, R],
    [_, R, R, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
    [_, R, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    [_, _, _, _, _, R, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, R, R, R, _, _, _, _, _, _, R, R, R, D, D, D, R, R, R],
    [_, _, _, _, R, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, _, D, D, D, D, D, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [D, D, D, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, R, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, _, T, T, _, _, _, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, T, T, T, T, T, T, _, _, _, _, _, R, R, R, D, D, D, D, D, R],
    [_, _, T, T, T, R, R, T, _, _, _, _, _, _, R, R, D, D, D, R, R, R],
    [_, _, T, T, T, R, R, T, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
    [_, _, T, _, T, T, T, T, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
];

/** Point of interest: center of cave floor (campfire location in mission 2). */
export const CAVE_CAMPFIRE = { row: 10, col: 19 } as const;

/** Points of interest for crystal placements (same as mission 2). */
export const CRYSTAL_POINTS = {
    crystal_1: { row: 7, col: 16 },
    crystal_2: { row: 13, col: 16 },
    crystal_3: { row: 6, col: 18 },
    crystal_4: { row: 17, col: 17 },
    crystal_5: { row: 13, col: 20 },
} as const;
