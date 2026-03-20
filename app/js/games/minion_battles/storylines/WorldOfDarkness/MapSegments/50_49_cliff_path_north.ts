/**
 * 50_49 Cliff Path North - Path heading north toward 50_48.
 * Rock wall on the right, 2-tile path, frequent rocks and thick grass.
 * Small inlet in the cliff wall near the north; path approaches but does not enter.
 */

import { TerrainType } from '../../../terrain/TerrainType';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_49_CLIFF_PATH_NORTH: TerrainType[][] = [
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, R, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, _, T, R, R, D, D, _, _, T, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, T, T, _, _, D, D, _, T, T, T, _, _, _, _, _, _, _, _, _, R, R],
    [R, T, _, _, R, D, D, _, T, T, _, _, R, _, _, _, _, _, _, _, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, R, R, _, _, _, _, _, _, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, _, T, _, _, D, D, _, _, T, T, _, _, _, _, _, _, R, R, R, R, R],
    [R, T, T, T, _, D, D, _, T, T, T, T, _, _, _, _, _, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, R, R, R, R, R, R],
    [R, _, R, _, _, D, D, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    [R, _, R, R, _, D, D, _, _, T, _, _, _, _, _, R, R, R, R, R, R, R],
    [R, _, _, _, _, D, D, _, T, T, T, _, _, _, R, R, R, R, R, R, R, R],
    [R, T, _, _, _, D, D, _, _, _, _, _, _, _, R, R, R, R, R, R, R, R],
    [R, T, T, _, _, D, D, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [R, _, _, _, R, D, D, _, _, _, _, _, R, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, _, _, R, R, R, R, R, R, R, R, R],
    [R, _, _, R, R, D, D, _, _, _, _, _, _, _, _, R, R, R, R, R, R, R],
    [R, _, T, T, _, D, D, _, _, _, _, _, _, _, _, _, R, R, R, R, R],
    [R, T, T, _, _, _, _, _, _, _, _, _, _, _, _, _, _, R, R, R, R],
    [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
];

export interface PointOfInterest {
    row: number;
    col: number;
}

/** Center of the small inlet in the cliff wall (north side). */
export const cave_center: PointOfInterest = { row: 4, col: 16 };

/** Center of the path, ~3 rows from the top. */
export const north_path: PointOfInterest = { row: 3, col: 6 };

/** Center of the path, ~3 rows from the bottom. */
export const south_path: PointOfInterest = { row: 18, col: 5 };

export const pointsOfInterest = {
    cave_center,
    north_path,
    south_path,
} as const;
