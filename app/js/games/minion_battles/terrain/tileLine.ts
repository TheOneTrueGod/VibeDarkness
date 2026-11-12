/**
 * Shared integer tile-line tracer for sight lines, light occlusion and any other "can A reach B
 * across the grid" check. One tracer keeps vision, light and AI line of sight in agreement.
 *
 * The line steps one tile at a time along its major axis; the minor axis rounds to the nearest tile
 * (halves round towards +∞), the same rule `TerrainGrid.hasLineOfSight` has always used. It is done
 * in integer arithmetic, so the tiles visited from A to B are exactly the tiles visited from B to A
 * (in reverse order) — a sight line never depends on which end is the viewer.
 *
 * A diagonal step moves both axes at once, so a line may pass between two tiles that touch only at
 * a corner.
 */

/** Called for each tile on a line. Return `false` to stop the walk early. */
export type TileLineVisitor = (col: number, row: number) => boolean | void;

/** Predicate for whether a tile stops a line (e.g. `TerrainManager.blocksVisionAt`). */
export type TileBlocksFn = (col: number, row: number) => boolean;

/** Rounds `num / den` (den > 0) to the nearest integer, halves towards +∞, in exact integer maths. */
function roundDiv(num: number, den: number): number {
    return Math.floor((2 * num + den) / (2 * den));
}

/**
 * Visit every tile on the integer line from (c0, r0) to (c1, r1), both ends inclusive, in order.
 * Coordinates must be integers. Returns `true` if the walk reached the end tile, `false` if the
 * visitor stopped it.
 */
export function forEachTileOnLine(c0: number, r0: number, c1: number, r1: number, visit: TileLineVisitor): boolean {
    const dc = c1 - c0;
    const dr = r1 - r0;
    const steps = Math.max(Math.abs(dc), Math.abs(dr));
    if (steps === 0) return visit(c0, r0) !== false;
    for (let i = 0; i <= steps; i++) {
        const col = c0 + roundDiv(dc * i, steps);
        const row = r0 + roundDiv(dr * i, steps);
        if (visit(col, row) === false) return false;
    }
    return true;
}

/**
 * True when no tile strictly between (c0, r0) and (c1, r1) is blocking. Both endpoints are ignored,
 * so a viewer standing next to a wall still sees (and lights) that wall tile itself; only tiles
 * behind it are cut off.
 */
export function isTileLineClear(c0: number, r0: number, c1: number, r1: number, blocks: TileBlocksFn): boolean {
    return forEachTileOnLine(c0, r0, c1, r1, (col, row) => {
        if ((col === c0 && row === r0) || (col === c1 && row === r1)) return true;
        return !blocks(col, row);
    });
}

/**
 * True when the straight segment from world-tile point (x0, y0) to (x1, y1) (in tile units) crosses
 * no blocking tile. The tiles containing the two end points are ignored. Exact grid traversal
 * (Amanatides–Woo); a segment passing exactly through a grid corner steps diagonally without
 * checking the two side tiles.
 */
export function isTileRayClear(x0: number, y0: number, x1: number, y1: number, blocks: TileBlocksFn): boolean {
    let col = Math.floor(x0);
    let row = Math.floor(y0);
    const startCol = col;
    const startRow = row;
    const endCol = Math.floor(x1);
    const endRow = Math.floor(y1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tMaxX = dx > 0 ? (col + 1 - x0) / dx : dx < 0 ? (x0 - col) / -dx : Infinity;
    let tMaxY = dy > 0 ? (row + 1 - y0) / dy : dy < 0 ? (y0 - row) / -dy : Infinity;
    const maxSteps = Math.abs(endCol - startCol) + Math.abs(endRow - startRow);
    for (let i = 0; i < maxSteps && !(col === endCol && row === endRow); i++) {
        if (tMaxX < tMaxY) {
            col += stepX;
            tMaxX += tDeltaX;
        } else if (tMaxY < tMaxX) {
            row += stepY;
            tMaxY += tDeltaY;
        } else {
            col += stepX;
            row += stepY;
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
        }
        if ((col === startCol && row === startRow) || (col === endCol && row === endRow)) continue;
        if (blocks(col, row)) return false;
    }
    return true;
}

/** How far (in tiles) the permissive sample points sit from a tile centre on each axis. */
export const PERMISSIVE_SAMPLE_INSET = 0.35;

/** Sample offsets inside a tile: the centre, then four points towards its corners. */
const PERMISSIVE_OFFSETS: readonly (readonly [number, number])[] = [
    [0, 0],
    [-PERMISSIVE_SAMPLE_INSET, -PERMISSIVE_SAMPLE_INSET],
    [PERMISSIVE_SAMPLE_INSET, -PERMISSIVE_SAMPLE_INSET],
    [-PERMISSIVE_SAMPLE_INSET, PERMISSIVE_SAMPLE_INSET],
    [PERMISSIVE_SAMPLE_INSET, PERMISSIVE_SAMPLE_INSET],
];

/**
 * Forgiving sight line: true when {@link isTileLineClear} is, or when any straight segment from a
 * sample point in the start tile to a sample point in the end tile (centre plus four inset corner
 * points each) is clear. "Any part of tile A can see any part of tile B", so a pillar that merely
 * clips the centre-to-centre line does not hide what is behind it. Endpoints are ignored, as in
 * {@link isTileLineClear}. Symmetric: the same segment pairs are tried from either end.
 */
export function isTileLineClearPermissive(
    c0: number,
    r0: number,
    c1: number,
    r1: number,
    blocks: TileBlocksFn,
): boolean {
    if (isTileLineClear(c0, r0, c1, r1, blocks)) return true;
    for (const [ax, ay] of PERMISSIVE_OFFSETS) {
        const x0 = c0 + 0.5 + ax;
        const y0 = r0 + 0.5 + ay;
        for (const [bx, by] of PERMISSIVE_OFFSETS) {
            if (isTileRayClear(x0, y0, c1 + 0.5 + bx, r1 + 0.5 + by, blocks)) return true;
        }
    }
    return false;
}
