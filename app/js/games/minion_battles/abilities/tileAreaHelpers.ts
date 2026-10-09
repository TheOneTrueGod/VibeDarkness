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

/**
 * The five cells of a plus sign: `center` then its N/E/S/W neighbours (fixed order, center first).
 * No bounds filtering — callers with grid access must skip out-of-bounds cells.
 */
export function getPlusTileAreaCells(center: TileCoord): TileCoord[] {
    return [
        { col: center.col, row: center.row },
        { col: center.col, row: center.row - 1 },
        { col: center.col + 1, row: center.row },
        { col: center.col, row: center.row + 1 },
        { col: center.col - 1, row: center.row },
    ];
}

/** Closed 12-vertex perimeter (world px, clockwise from the top arm) of the plus sign around `center`. */
export function plusTileAreaPerimeter(center: TileCoord): { x: number; y: number }[] {
    const x0 = (center.col - 1) * CELL_SIZE;
    const x1 = center.col * CELL_SIZE;
    const x2 = (center.col + 1) * CELL_SIZE;
    const x3 = (center.col + 2) * CELL_SIZE;
    const y0 = (center.row - 1) * CELL_SIZE;
    const y1 = center.row * CELL_SIZE;
    const y2 = (center.row + 1) * CELL_SIZE;
    const y3 = (center.row + 2) * CELL_SIZE;
    return [
        { x: x1, y: y0 }, { x: x2, y: y0 }, { x: x2, y: y1 }, { x: x3, y: y1 },
        { x: x3, y: y2 }, { x: x2, y: y2 }, { x: x2, y: y3 }, { x: x1, y: y3 },
        { x: x1, y: y2 }, { x: x0, y: y2 }, { x: x0, y: y1 }, { x: x1, y: y1 },
    ];
}

/**
 * Draws the plus-sign telegraph: a translucent fill over each of the five tiles and a solid
 * outline around the shape's perimeter only (no lines between tiles).
 */
export function drawPlusTileArea(
    gr: {
        moveTo(x: number, y: number): unknown;
        lineTo(x: number, y: number): unknown;
        fill(style: { color: number; alpha?: number }): unknown;
        stroke(style: { color: number; width: number; alpha?: number }): unknown;
    },
    center: TileCoord,
    style: { color: number; fillAlpha: number; strokeAlpha: number; lineWidth: number },
): void {
    for (const cell of getPlusTileAreaCells(center)) {
        const minX = cell.col * CELL_SIZE;
        const minY = cell.row * CELL_SIZE;
        gr.moveTo(minX, minY);
        gr.lineTo(minX + CELL_SIZE, minY);
        gr.lineTo(minX + CELL_SIZE, minY + CELL_SIZE);
        gr.lineTo(minX, minY + CELL_SIZE);
        gr.lineTo(minX, minY);
        gr.fill({ color: style.color, alpha: style.fillAlpha });
    }
    const outline = plusTileAreaPerimeter(center);
    gr.moveTo(outline[0].x, outline[0].y);
    for (let i = 1; i < outline.length; i++) gr.lineTo(outline[i].x, outline[i].y);
    gr.lineTo(outline[0].x, outline[0].y);
    gr.stroke({ color: style.color, width: style.lineWidth, alpha: style.strokeAlpha });
}
