/**
 * 10_10 East cave — home tile with the 50_50 chamber mirrored so the mouth faces east.
 * The rest of the tile is rock; a 2×2 hole in the east wall sits immediately beside that mouth.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import {
    CAVE_CAMPFIRE,
    CRYSTAL_CAVE_CHAMBER,
    CRYSTAL_CAVE_MOUTH_ROW_START,
    CRYSTAL_CAVE_SIZE,
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
} from './50_50_crystal_cave';

export const EAST_CAVE_SEGMENT_ID = '10_10_east_cave';
export const EAST_CAVE_GRID_COL = 10;
export const EAST_CAVE_GRID_ROW = 10;
export const EAST_CAVE_SIZE = CRYSTAL_CAVE_SIZE;

export const EAST_WALL_OPENING_SIZE = 2;
export const EAST_WALL_OPENING_COL = EAST_CAVE_SIZE - EAST_WALL_OPENING_SIZE;
export const EAST_WALL_OPENING_ROW = CRYSTAL_CAVE_MOUTH_ROW_START;

function mirrorChamberCol(col: number): number {
    return CRYSTAL_CAVE_CHAMBER.colStart + CRYSTAL_CAVE_CHAMBER.colEnd - col;
}

/** Campfire on the mirrored chamber floor (same relative spot as 50_50). */
export const EAST_CAVE_CAMPFIRE = {
    col: mirrorChamberCol(CAVE_CAMPFIRE.col),
    row: CAVE_CAMPFIRE.row,
} as const;

export const pointsOfInterest = {
    campfire: EAST_CAVE_CAMPFIRE,
} as const;

function isEastWallOpening(col: number, row: number): boolean {
    return (
        col >= EAST_WALL_OPENING_COL &&
        col < EAST_WALL_OPENING_COL + EAST_WALL_OPENING_SIZE &&
        row >= EAST_WALL_OPENING_ROW &&
        row < EAST_WALL_OPENING_ROW + EAST_WALL_OPENING_SIZE
    );
}

function buildEastCaveTerrain(): TerrainType[][] {
    const rows: TerrainType[][] = [];
    for (let r = 0; r < EAST_CAVE_SIZE; r++) {
        const row: TerrainType[] = [];
        for (let c = 0; c < EAST_CAVE_SIZE; c++) {
            row.push(TerrainType.Rock);
        }
        rows.push(row);
    }

    for (let r = CRYSTAL_CAVE_CHAMBER.rowStart; r <= CRYSTAL_CAVE_CHAMBER.rowEnd; r++) {
        for (let c = CRYSTAL_CAVE_CHAMBER.colStart; c <= CRYSTAL_CAVE_CHAMBER.colEnd; c++) {
            rows[r]![c] = MAP_SEGMENT_50_50_CRYSTAL_CAVE[r]![mirrorChamberCol(c)]!;
        }
    }

    const eastCol = EAST_CAVE_SIZE - 1;
    for (let r = 0; r < EAST_CAVE_SIZE; r++) {
        if (!isEastWallOpening(eastCol, r)) {
            rows[r]![eastCol] = TerrainType.Rock;
        }
    }

    for (let dr = 0; dr < EAST_WALL_OPENING_SIZE; dr++) {
        for (let dc = 0; dc < EAST_WALL_OPENING_SIZE; dc++) {
            rows[EAST_WALL_OPENING_ROW + dr]![EAST_WALL_OPENING_COL + dc] = TerrainType.Dirt;
        }
    }

    return rows;
}

export const MAP_SEGMENT_10_10_EAST_CAVE: TerrainType[][] = buildEastCaveTerrain();
