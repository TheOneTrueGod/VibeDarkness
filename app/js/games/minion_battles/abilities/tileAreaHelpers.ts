/**
 * Square tile-area targeting geometry.
 *
 * A "square tile-area" is an (2*half+1) x (2*half+1) block of grid cells whose
 * center cell is chosen by the player, tile-snapped, and clamped so its Chebyshev
 * (chessboard) distance from the caster's cell is 0..maxTileOffset.
 *
 * Pure module: depends only on CELL_SIZE so the hitbox preview, renderActivePreview,
 * and doCardEffect all snap identically (none of them can be allowed to drift).
 */

import { CELL_SIZE } from '../terrain/TerrainGrid';

export interface TileCoord {
    col: number;
    row: number;
}

/** Cell a world point falls in. Matches `TerrainGrid.worldToGrid`. */
export function worldToTile(x: number, y: number): TileCoord {
    return { col: Math.floor(x / CELL_SIZE), row: Math.floor(y / CELL_SIZE) };
}

function clampInt(v: number, min: number, max: number): number {
    return v < min ? min : v > max ? max : v;
}

/**
 * Center cell of a square tile-area: the aim cell clamped so each axis offset from
 * the caster cell is within [-maxTileOffset, +maxTileOffset] (true Chebyshev — axes
 * clamped independently). `maxTileOffset` 0 => region centered on the caster;
 * 2 => the region sits adjacent to but not overlapping the caster.
 */
export function snapSquareTileAreaCenter(
    casterX: number,
    casterY: number,
    aimX: number,
    aimY: number,
    maxTileOffset: number,
): TileCoord {
    const caster = worldToTile(casterX, casterY);
    const aim = worldToTile(aimX, aimY);
    const dCol = clampInt(aim.col - caster.col, -maxTileOffset, maxTileOffset);
    const dRow = clampInt(aim.row - caster.row, -maxTileOffset, maxTileOffset);
    return { col: caster.col + dCol, row: caster.row + dRow };
}

/**
 * The (2*half+1)^2 cells around `center`, in deterministic row-major order.
 * No bounds filtering — callers with grid access must skip out-of-bounds cells.
 */
export function getSquareTileAreaCells(center: TileCoord, half: number = 1): TileCoord[] {
    const cells: TileCoord[] = [];
    for (let dRow = -half; dRow <= half; dRow++) {
        for (let dCol = -half; dCol <= half; dCol++) {
            cells.push({ col: center.col + dCol, row: center.row + dRow });
        }
    }
    return cells;
}

/** Outer world-space rectangle of the square, for drawing (moveTo + 4x lineTo). */
export function squareTileAreaWorldRect(
    center: TileCoord,
    half: number = 1,
): { minX: number; minY: number; maxX: number; maxY: number } {
    return {
        minX: (center.col - half) * CELL_SIZE,
        minY: (center.row - half) * CELL_SIZE,
        maxX: (center.col + half + 1) * CELL_SIZE,
        maxY: (center.row + half + 1) * CELL_SIZE,
    };
}
