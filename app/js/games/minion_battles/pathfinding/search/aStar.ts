/**
 * aStar - Allocation-free A* pathfinding on a NavGrid.
 *
 * Reuses scratch buffers (g, f, parent, stamp, heap) across calls via a
 * generation counter. Integer costs, octile heuristic, deterministic
 * tie-breaking by `side` (neighbor iteration order).
 *
 * Returns the chain of cell indices from AFTER start through goal inclusive,
 * or null if unreachable.
 */

import type { NavGrid } from '../NavGrid';
import type { NavProfileId } from '../navProfile';
import { BinaryHeap } from './BinaryHeap';
import { DIR_X_SIDE0, DIR_Y_SIDE0, DIR_X_SIDE1, DIR_Y_SIDE1 } from './neighbours';

/** Module-level scratch buffers, reallocated only when grid size changes. */
let gCost: Int32Array | null = null;
let fCost: Int32Array | null = null;
let parent: Int32Array | null = null;
let openStamp: Uint32Array | null = null;
let closedStamp: Uint32Array | null = null;
let heap: BinaryHeap | null = null;
let lastCapacity = 0;

let generation = 0;

/**
 * Heap key = f, with ties broken toward the node nearer the goal (lower h). Without this an open
 * field has thousands of equal-f cells and the search floods them all. f stays far below 2^20
 * for any realistic map, so the packed key fits an Int32.
 */
const H_TIE_BITS = 11;
const H_TIE_MAX = (1 << H_TIE_BITS) - 1;
function packKey(g: number, h: number): number {
    return ((g + h) << H_TIE_BITS) + (h < H_TIE_MAX ? h : H_TIE_MAX);
}

/**
 * A* search from startIdx to goalIdx.
 *
 * @param nav The NavGrid.
 * @param profile The nav profile to use.
 * @param startIdx Start cell index.
 * @param goalIdx Goal cell index.
 * @param side 0 or 1; selects the neighbor iteration order for determinism.
 * @returns Cell indices (start excluded, goal included), or null if unreachable.
 */
export function aStar(
    nav: NavGrid,
    profile: NavProfileId,
    startIdx: number,
    goalIdx: number,
    side: 0 | 1,
): number[] | null {
    // Quick checks.
    if (!nav.isPassableIdx(profile, startIdx) || !nav.isPassableIdx(profile, goalIdx)) {
        return null;
    }

    if (startIdx === goalIdx) {
        return [];
    }

    if (!nav.sameComponent(profile, startIdx, goalIdx)) {
        return null;
    }

    // Allocate or reuse buffers.
    const capacity = nav.width * nav.height;
    if (lastCapacity !== capacity) {
        gCost = new Int32Array(capacity);
        fCost = new Int32Array(capacity);
        parent = new Int32Array(capacity);
        openStamp = new Uint32Array(capacity);
        closedStamp = new Uint32Array(capacity);
        heap = new BinaryHeap(capacity, fCost);
        lastCapacity = capacity;
    }

    // Increment generation for this search.
    generation++;

    const g = gCost!;
    const f = fCost!;
    const p = parent!;
    const open = openStamp!;
    const closed = closedStamp!;
    const h = heap!;

    h.clear();
    h.setTieOrder(side === 1);

    // Initialize start node.
    g[startIdx] = 0;
    const hStart = heuristic(nav, startIdx, goalIdx);
    f[startIdx] = packKey(0, hStart);
    open[startIdx] = generation;
    h.push(startIdx);

    const dirX = side === 0 ? DIR_X_SIDE0 : DIR_X_SIDE1;
    const dirY = side === 0 ? DIR_Y_SIDE0 : DIR_Y_SIDE1;

    while (true) {
        const current = h.pop();
        if (current === -1) {
            return null; // Unreachable.
        }

        if (current === goalIdx) {
            // Reconstruct path.
            const path: number[] = [];
            let node = goalIdx;
            while (node !== startIdx) {
                path.push(node);
                node = p[node];
            }
            path.reverse();
            return path;
        }

        closed[current] = generation;

        const curCol = current % nav.width;
        const curRow = Math.floor(current / nav.width);
        const curG = g[current];

        // Explore neighbors.
        for (let d = 0; d < 8; d++) {
            const nextCol = curCol + dirX[d];
            const nextRow = curRow + dirY[d];

            if (nextCol < 0 || nextCol >= nav.width || nextRow < 0 || nextRow >= nav.height) {
                continue;
            }

            const next = nextRow * nav.width + nextCol;

            // Skip closed nodes.
            if (closed[next] === generation) {
                continue;
            }

            // Check passability.
            if (!nav.isPassableIdx(profile, next)) {
                continue;
            }

            // Diagonal corner rule.
            if (dirX[d] !== 0 && dirY[d] !== 0) {
                const orth1 = curRow * nav.width + (curCol + dirX[d]);
                const orth2 = (curRow + dirY[d]) * nav.width + curCol;
                if (!nav.isPassableIdx(profile, orth1) || !nav.isPassableIdx(profile, orth2)) {
                    continue;
                }
            }

            // Compute cost.
            const stepCost = nav.stepCost(profile, next);
            let moveCost = stepCost;
            if (dirX[d] !== 0 && dirY[d] !== 0) {
                // Diagonal: multiply by 1.4 (or round(cost * 1.4)).
                moveCost = Math.round(stepCost * 1.4);
            }

            const newG = curG + moveCost;

            // Only update if this is a better path.
            if (open[next] !== generation) {
                // First time visiting this node.
                g[next] = newG;
                f[next] = packKey(newG, heuristic(nav, next, goalIdx));
                p[next] = current;
                open[next] = generation;
                h.push(next);
            } else if (newG < g[next]) {
                // Found a better path.
                g[next] = newG;
                f[next] = packKey(newG, heuristic(nav, next, goalIdx));
                p[next] = current;
                h.update(next);
            }
        }
    }
}

/**
 * Octile heuristic (integer, in the same units as costs).
 * heuristic = 10 * max(dx, dy) + 4 * min(dx, dy)
 */
function heuristic(nav: NavGrid, from: number, to: number): number {
    const fromCol = from % nav.width;
    const fromRow = Math.floor(from / nav.width);
    const toCol = to % nav.width;
    const toRow = Math.floor(to / nav.width);

    const dx = Math.abs(toCol - fromCol);
    const dy = Math.abs(toRow - fromRow);
    const minD = Math.min(dx, dy);
    const maxD = Math.max(dx, dy);

    return 10 * maxD + 4 * minD;
}
