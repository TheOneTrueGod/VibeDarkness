/**
 * smoothing - String-pull path smoothing for dense cell chains.
 *
 * Converts a cell-index chain (from A*) into sparse waypoints.
 * Greedily extends visibility as far as possible while respecting the
 * line-of-walk test and step-cost constraints (no shortcuts through
 * expensive terrain).
 */

import type { NavGrid } from './NavGrid';
import type { NavProfileId } from './navProfile';
import { hasLineOfWalk, maxStepCostOnLine } from './lineOfWalk';
import { CELL_SIZE } from '../terrain/TerrainGrid';

/** Maximum cells a corner waypoint can be widened outward (per-unit spreading). */
export const CORNER_WIDEN_MAX_CELLS = 2;

export interface Waypoint {
    col: number;
    row: number;
}

/**
 * Smooth a dense cell-index chain into sparse waypoints.
 *
 * @param nav The NavGrid.
 * @param profile The nav profile.
 * @param startX Start world x coordinate.
 * @param startY Start world y coordinate.
 * @param chain Array of cell indices (start excluded, goal last).
 * @param lane Per-unit lane spreading (0 = no corner widening, 1 = maximum). Defaults to 0.
 * @returns Array of waypoints (goal always last).
 */
export function smoothPath(
    nav: NavGrid,
    profile: NavProfileId,
    startX: number,
    startY: number,
    chain: number[],
    lane: number = 0,
): Waypoint[] {
    if (chain.length === 0) {
        return [];
    }

    const waypoints: Waypoint[] = [];
    let anchorX = startX;
    let anchorY = startY;
    let i = 0;

    // costCap[j]: costliest cell the chain itself crosses from the current anchor up to chain[j];
    // a shortcut to chain[j] may not cross anything costlier (weighted-terrain guard).
    const costCap = new Int32Array(chain.length);

    while (i < chain.length) {
        let cap = nav.stepCost(
            profile,
            Math.floor(anchorY / CELL_SIZE) * nav.width + Math.floor(anchorX / CELL_SIZE),
        );
        for (let j = i; j < chain.length; j++) {
            const cost = nav.stepCost(profile, chain[j]);
            if (cost > cap) cap = cost;
            costCap[j] = cap;
        }

        const ax = anchorX;
        const ay = anchorY;
        const visible = (j: number): boolean => {
            const cellIdx = chain[j];
            const cellX = (cellIdx % nav.width) * CELL_SIZE + CELL_SIZE / 2;
            const cellY = Math.floor(cellIdx / nav.width) * CELL_SIZE + CELL_SIZE / 2;
            return hasLineOfWalk(nav, profile, ax, ay, cellX, cellY)
                && maxStepCostOnLine(nav, profile, ax, ay, cellX, cellY) <= costCap[j];
        };

        // Furthest visible chain cell: gallop forward (1, 2, 4, … cells) until a miss, then
        // binary-search the gap. O(log n) line checks per waypoint instead of O(n). Visibility is
        // not strictly monotonic, so this can stop a little short; every emitted segment is still
        // verified walkable, and the result is deterministic.
        let lastVisible = i;
        if (visible(i)) {
            let step = 1;
            let miss = -1;
            while (lastVisible < chain.length - 1) {
                const cand = Math.min(lastVisible + step, chain.length - 1);
                if (visible(cand)) {
                    lastVisible = cand;
                    step *= 2;
                } else {
                    miss = cand;
                    break;
                }
            }
            if (miss !== -1) {
                let lo = lastVisible;
                let hi = miss;
                while (hi - lo > 1) {
                    const mid = (lo + hi) >> 1;
                    if (visible(mid)) lo = mid;
                    else hi = mid;
                }
                lastVisible = lo;
            }
        }
        // (When not even chain[i] is visible it is still taken: an adjacent step.)

        // Emit the waypoint at lastVisible.
        const cellIdx = chain[lastVisible];
        const col = cellIdx % nav.width;
        const row = Math.floor(cellIdx / nav.width);
        waypoints.push({ col, row });

        // Anchor to this waypoint and continue.
        anchorX = col * CELL_SIZE + CELL_SIZE / 2;
        anchorY = row * CELL_SIZE + CELL_SIZE / 2;
        i = lastVisible + 1;
    }

    // Corner widening: if lane > 0, shift interior waypoints outward for per-unit spreading.
    if (lane > 0 && waypoints.length >= 2) {
        widenCorners(nav, profile, startX, startY, waypoints, lane);
    }

    return waypoints;
}

/**
 * Widen corner waypoints outward to spread units across lanes.
 * Shifts each interior waypoint (not the goal) away from the obstacle it wraps,
 * respecting passability and line-of-walk constraints.
 */
function widenCorners(
    nav: NavGrid,
    profile: NavProfileId,
    startX: number,
    startY: number,
    waypoints: Waypoint[],
    lane: number,
): void {
    let prevX = startX;
    let prevY = startY;

    for (let i = 0; i < waypoints.length - 1; i++) {
        const w = waypoints[i]!;
        const n = waypoints[i + 1]!;

        const wx = w.col * CELL_SIZE + CELL_SIZE / 2;
        const wy = w.row * CELL_SIZE + CELL_SIZE / 2;
        const nx = n.col * CELL_SIZE + CELL_SIZE / 2;
        const ny = n.row * CELL_SIZE + CELL_SIZE / 2;

        // Compute incoming and outgoing directions.
        const v1x = wx - prevX;
        const v1y = wy - prevY;
        const v1len = Math.hypot(v1x, v1y);
        if (v1len === 0) {
            prevX = wx;
            prevY = wy;
            continue;
        }
        const v1nx = v1x / v1len;
        const v1ny = v1y / v1len;

        const v2x = nx - wx;
        const v2y = ny - wy;
        const v2len = Math.hypot(v2x, v2y);
        if (v2len === 0) {
            prevX = wx;
            prevY = wy;
            continue;
        }
        const v2nx = v2x / v2len;
        const v2ny = v2y / v2len;

        // Outward direction: v1 - v2 points away from the obstacle.
        const ox = v1nx - v2nx;
        const oy = v1ny - v2ny;
        const olen = Math.hypot(ox, oy);

        // If nearly straight (no corner), keep the waypoint.
        if (olen < 0.2) {
            prevX = wx;
            prevY = wy;
            continue;
        }

        // Normalize outward direction to the nearest grid direction (8 directions).
        const oxn = ox / olen;
        const oyn = oy / olen;
        const dc = Math.round(oxn);
        const dr = Math.round(oyn);

        // Skip if the outward direction rounds to (0, 0).
        if (dc === 0 && dr === 0) {
            prevX = wx;
            prevY = wy;
            continue;
        }

        // Count passable cells outward.
        let free = 0;
        while (free < CORNER_WIDEN_MAX_CELLS) {
            const nextCol = w.col + (free + 1) * dc;
            const nextRow = w.row + (free + 1) * dr;
            if (!nav.isPassable(profile, nextCol, nextRow)) break;
            free++;
        }

        // Determine how many cells to shift based on lane.
        const shift = Math.min(free, Math.floor(lane * (free + 1)));

        // Try shifts from highest to lowest, accepting the first valid one.
        let accepted = false;
        for (let s = shift; s >= 1; s--) {
            const c = {
                col: w.col + s * dc,
                row: w.row + s * dr,
            };

            const cx = c.col * CELL_SIZE + CELL_SIZE / 2;
            const cy = c.row * CELL_SIZE + CELL_SIZE / 2;

            // Check line of walk from previous anchor to candidate.
            const walkToPrev = hasLineOfWalk(nav, profile, prevX, prevY, cx, cy);
            if (!walkToPrev) continue;

            // Check line of walk from candidate to next waypoint.
            const walkToNext = hasLineOfWalk(nav, profile, cx, cy, nx, ny);
            if (!walkToNext) continue;

            // Check step cost: candidate cell must not be costlier than the original corner.
            const cornerCost = nav.stepCost(profile, w.row * nav.width + w.col);
            const candidateCost = nav.stepCost(profile, c.row * nav.width + c.col);
            if (candidateCost > cornerCost) continue;

            // All checks passed: accept this shift.
            waypoints[i] = c;
            accepted = true;
            break;
        }

        // Update previous anchor position.
        if (accepted) {
            const c = waypoints[i]!;
            prevX = c.col * CELL_SIZE + CELL_SIZE / 2;
            prevY = c.row * CELL_SIZE + CELL_SIZE / 2;
        } else {
            prevX = wx;
            prevY = wy;
        }
    }
}
