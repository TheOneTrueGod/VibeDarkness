/**
 * 50_50 Crystal Cave - Reusable map segment.
 * Rocky cave (backwards C shape) with opening at left, crystals on right wall.
 * Used in mission 2 (Towards the Light), mission 3 (Light Empowered), mission 4 (Monster).
 */

import { TerrainType } from '../../../terrain/TerrainType';
import type { SpecialTilePlacement } from '../../types';

const _ = TerrainType.Grass;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;
const D = TerrainType.Dirt;

export const MAP_SEGMENT_50_50_CRYSTAL_CAVE: TerrainType[][] = [
    [R, R, R, R, R, R, R, _, _, D, D, _, R, R, R, R, R, R, R, R, R, R],
    [_, _, R, R, _, _, R, _, _, D, D, _, T, T, R, R, R, R, R, R, R, R],
    [_, R, R, _, _, _, _, _, _, D, D, _, T, T, R, R, R, R, R, R, R, R],
    [_, R, _, _, _, _, _, _, _, D, D, _, T, T, T, R, R, R, R, R, R, R],
    [_, _, _, _, _, R, _, _, _, D, D, _, _, R, R, R, R, R, R, R, R, R],
    [_, _, _, _, R, R, R, _, _, D, D, _, _, R, R, R, D, D, D, R, R, R],
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

/** Point of interest: center of cave floor (campfire location in missions 2 and 3). */
export const CAVE_CAMPFIRE = { row: 10, col: 19 } as const;

export const pointsOfInterest = {
    campfire: CAVE_CAMPFIRE,
} as const;

/** Points of interest for crystal placements (segment-local grid). */
export const CRYSTAL_POINTS = {
    crystal_1: { row: 7, col: 16 },
    crystal_2: { row: 13, col: 16 },
    crystal_3: { row: 6, col: 18 },
    crystal_4: { row: 17, col: 17 },
    crystal_5: { row: 13, col: 20 },
} as const;

/** Shared gameplay fields for the five cave crystals (position added per mission via offset). */
export const CRYSTAL_TILE_DEFAULTS: Omit<SpecialTilePlacement, 'col' | 'row'> = {
    defId: 'Crystal',
    emitsLight: { lightAmount: 20, radius: 3 },
    protectRadius: 3,
};

const CRYSTAL_POSITIONS_ORDERED = [
    CRYSTAL_POINTS.crystal_1,
    CRYSTAL_POINTS.crystal_2,
    CRYSTAL_POINTS.crystal_3,
    CRYSTAL_POINTS.crystal_4,
    CRYSTAL_POINTS.crystal_5,
] as const;

/**
 * Full special-tile placements for the standard cave crystals, shifted onto the mission grid.
 * @param colOffset — e.g. horizontal index where this 22-wide segment starts
 * @param rowOffset — e.g. vertical index where this segment starts (stacked maps)
 */
export function crystalSpecialTilesAt(colOffset: number, rowOffset = 0): SpecialTilePlacement[] {
    return CRYSTAL_POSITIONS_ORDERED.map(({ col, row }) => ({
        ...CRYSTAL_TILE_DEFAULTS,
        col: col + colOffset,
        row: row + rowOffset,
    }));
}
