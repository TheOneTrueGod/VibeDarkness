/**
 * lineOfWalk - Exact grid traversal for line-of-sight checks.
 *
 * Uses Amanatides-Woo DDA to visit every cell a segment touches.
 * Enforces the corner rule: when a segment passes exactly through a
 * grid corner, both orthogonal neighbours must be passable.
 */

import type { NavGrid } from './NavGrid';
import type { NavProfileId } from './navProfile';
import { CELL_SIZE } from '../terrain/TerrainGrid';

/**
 * Helper: traverse a segment and call visitor on each cell.
 * Returns false if any cell is impassable or violates the corner rule.
 */
function traverse(
    nav: NavGrid,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    visitor: (col: number, row: number) => boolean,
    visitCornerNeighbours: boolean = true,
): boolean {
    let col0 = Math.floor(x0 / CELL_SIZE);
    let row0 = Math.floor(y0 / CELL_SIZE);
    const col1 = Math.floor(x1 / CELL_SIZE);
    const row1 = Math.floor(y1 / CELL_SIZE);

    // Zero-length segment: just check the single cell.
    if (col0 === col1 && row0 === row1) {
        return visitor(col0, row0);
    }

    // Determine step direction.
    const stepX = col1 > col0 ? 1 : col1 < col0 ? -1 : 0;
    const stepY = row1 > row0 ? 1 : row1 < row0 ? -1 : 0;

    // Compute entry tMax and tDelta.
    const dx = x1 - x0;
    const dy = y1 - y0;

    let tMaxX: number;
    let tMaxY: number;
    let tDeltaX: number;
    let tDeltaY: number;

    if (stepX !== 0) {
        const nextGridX = (col0 + (stepX > 0 ? 1 : 0)) * CELL_SIZE;
        tMaxX = (nextGridX - x0) / dx;
        tDeltaX = CELL_SIZE / Math.abs(dx);
    } else {
        tMaxX = Infinity;
        tDeltaX = Infinity;
    }

    if (stepY !== 0) {
        const nextGridY = (row0 + (stepY > 0 ? 1 : 0)) * CELL_SIZE;
        tMaxY = (nextGridY - y0) / dy;
        tDeltaY = CELL_SIZE / Math.abs(dy);
    } else {
        tMaxY = Infinity;
        tDeltaY = Infinity;
    }

    // Iteration cap to prevent infinite loops.
    const maxIter = nav.width + nav.height + 4;
    let iter = 0;

    while (iter < maxIter) {
        iter++;

        // Visit current cell.
        if (!visitor(col0, row0)) {
            return false;
        }

        // If we've reached the goal, we're done.
        if (col0 === col1 && row0 === row1) {
            return true;
        }

        // Determine which axis to step along.
        const cornerCross = Math.abs(tMaxX - tMaxY) < 1e-9;

        if (cornerCross) {
            // Stepping diagonally through a corner.
            // Both orthogonal neighbours must be passable.
            if (visitCornerNeighbours && (!visitor(col0 + stepX, row0) || !visitor(col0, row0 + stepY))) {
                return false;
            }

            col0 += stepX;
            row0 += stepY;
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
        } else if (tMaxX < tMaxY) {
            // Step along X axis.
            col0 += stepX;
            tMaxX += tDeltaX;
        } else {
            // Step along Y axis.
            row0 += stepY;
            tMaxY += tDeltaY;
        }
    }

    // Iteration cap exceeded; treat as blocked.
    return false;
}

/**
 * Half-width (px) of the corridor a walking unit needs. A segment only counts as walkable when
 * the centre line AND the two parallel lines this far either side of it are clear, so smoothed
 * paths do not scrape rock corners. Must stay below CELL_SIZE / 2 so one-cell corridors pass.
 */
export const NAV_AGENT_HALF_WIDTH = 8;

/**
 * Check if a line segment (in world pixels) has line of walk.
 * Returns true if every cell the segment (widened by `halfWidth`) touches is passable
 * and the segment never illegally squeezes diagonally. Pass `halfWidth` 0 to test the centre
 * line only (used when re-validating an existing path, where only a real blockage matters).
 */
export function hasLineOfWalk(
    nav: NavGrid,
    profile: NavProfileId,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    halfWidth: number = NAV_AGENT_HALF_WIDTH,
): boolean {
    const passable = (col: number, row: number) => nav.isPassable(profile, col, row);
    if (!traverse(nav, x0, y0, x1, y1, passable)) return false;

    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0 || halfWidth <= 0) return true;
    // Perpendicular offset. The side rays may start inside a wall cell when the endpoint itself
    // hugs a wall; that correctly reports "no room to walk this line".
    const ox = (-dy / len) * halfWidth;
    const oy = (dx / len) * halfWidth;
    return (
        traverse(nav, x0 + ox, y0 + oy, x1 + ox, y1 + oy, passable) &&
        traverse(nav, x0 - ox, y0 - oy, x1 - ox, y1 - oy, passable)
    );
}

/**
 * Check line of walk between two cell centres (convenience wrapper).
 */
export function hasLineOfWalkCells(
    nav: NavGrid,
    profile: NavProfileId,
    c0: number,
    r0: number,
    c1: number,
    r1: number,
): boolean {
    const x0 = c0 * CELL_SIZE + CELL_SIZE / 2;
    const y0 = r0 * CELL_SIZE + CELL_SIZE / 2;
    const x1 = c1 * CELL_SIZE + CELL_SIZE / 2;
    const y1 = r1 * CELL_SIZE + CELL_SIZE / 2;
    return hasLineOfWalk(nav, profile, x0, y0, x1, y1);
}

/**
 * Compute the maximum step cost on a line segment.
 * Used by smoothPath to guard against shortcutting through expensive terrain.
 */
export function maxStepCostOnLine(
    nav: NavGrid,
    profile: NavProfileId,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): number {
    let maxCost = 0;
    traverse(nav, x0, y0, x1, y1, (col, row) => {
        const idx = row * nav.width + col;
        const cost = nav.stepCost(profile, idx);
        maxCost = Math.max(maxCost, cost);
        return true; // Continue traversal even if high cost.
    }, false);
    return maxCost;
}
