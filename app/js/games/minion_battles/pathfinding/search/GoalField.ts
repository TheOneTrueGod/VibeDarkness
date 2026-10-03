/**
 * GoalField - Lazy, resumable goal-rooted Dijkstra distance field.
 *
 * Expands from the goal cell outward, settling cells in non-decreasing distance order.
 * Pauses and resumes: ensureSettled(cellIdx) continues until that cell is settled.
 * Results are independent of query order (deterministic).
 *
 * Uses only distances for chain extraction (no parent pointers), so the result
 * is identical whether the field is fully expanded or just partially settled.
 */

import type { NavGrid } from '../NavGrid';
import type { NavProfileId } from '../navProfile';
import { BinaryHeap } from './BinaryHeap';
import { DIR_X_SIDE0, DIR_Y_SIDE0, DIR_X_SIDE1, DIR_Y_SIDE1, stepMoveCost } from './neighbours';

/** Tolerance (in cost units) for choosing among neighbours with similar distances. */
export const ROUTE_TIE_EPSILON = 4;

export class GoalField {
    private nav: NavGrid;
    private profile: NavProfileId;
    private goalIdx: number;

    /** Cost to reach the goal from each cell (heap key). Only meaningful once the cell is settled. */
    private dist: Int32Array;

    /** Settlement status: 1 if settled, 0 otherwise. */
    private settled: Uint8Array;

    /** Seen status: 1 if seen (in heap or settled), 0 otherwise. */
    private seen: Uint8Array;

    /** Binary min-heap for Dijkstra expansion. */
    private heap: BinaryHeap;

    /** Count of settled cells. */
    private expandedCountVal: number = 0;

    constructor(nav: NavGrid, profile: NavProfileId, goalIdx: number) {
        this.nav = nav;
        this.profile = profile;
        this.goalIdx = goalIdx;

        const size = nav.width * nav.height;
        this.dist = new Int32Array(size);
        this.settled = new Uint8Array(size);
        this.seen = new Uint8Array(size);
        this.heap = new BinaryHeap(size, this.dist);

        // Initialize: if goal is passable, seed the heap.
        if (nav.isPassableIdx(profile, goalIdx)) {
            this.dist[goalIdx] = 0;
            this.seen[goalIdx] = 1;
            this.heap.push(goalIdx);
        }
    }

    /**
     * Get the settled count (for testing).
     */
    get expandedCount(): number {
        return this.expandedCountVal;
    }

    /**
     * Ensure a cell is settled (expanded if needed). Lazy Dijkstra.
     *
     * @param cellIdx The cell to settle.
     * @returns true if the cell is settled (reachable); false if unreachable or impassable.
     */
    ensureSettled(cellIdx: number): boolean {
        // Early rejection: impassable or unreachable component.
        if (!this.nav.isPassableIdx(this.profile, cellIdx)) {
            return false;
        }

        if (!this.nav.sameComponent(this.profile, cellIdx, this.goalIdx)) {
            return false;
        }

        // Already settled.
        if (this.settled[cellIdx]) {
            return true;
        }

        // Expand the heap until cellIdx is settled.
        while (true) {
            const u = this.heap.pop();
            if (u === -1) {
                // Heap empty; cellIdx is unreachable.
                return this.settled[cellIdx] === 1;
            }

            this.settled[u] = 1;
            this.expandedCountVal++;

            // Relax before pausing: u never re-enters the heap, so skipping this would leave its
            // neighbours with stale distances when the search resumes.
            this.relaxNeighbours(u);

            if (u === cellIdx) {
                return true;
            }
        }
    }

    /**
     * Get the distance to a cell (or -1 if unreachable/unsettled).
     */
    distance(cellIdx: number): number {
        if (!this.ensureSettled(cellIdx)) {
            return -1;
        }
        return this.dist[cellIdx];
    }

    /**
     * Extract a chain from a starting cell to the goal by following decreasing distances.
     *
     * @param fromIdx The starting cell (excluded from result).
     * @param side Tie-breaking order (0 or 1).
     * @returns Array of cell indices from the cell AFTER fromIdx through the goal,
     *          or null if fromIdx is unreachable.
     *          Empty array if fromIdx === goalIdx.
     */
    extractChain(fromIdx: number, side: 0 | 1): number[] | null {
        if (fromIdx === this.goalIdx) {
            return [];
        }

        if (!this.ensureSettled(fromIdx)) {
            return null;
        }

        const chain: number[] = [];
        let cur = fromIdx;
        let slack = ROUTE_TIE_EPSILON;

        const dirX = side === 0 ? DIR_X_SIDE0 : DIR_X_SIDE1;
        const dirY = side === 0 ? DIR_Y_SIDE0 : DIR_Y_SIDE1;
        const width = this.nav.width;

        while (cur !== this.goalIdx) {
            const curCol = cur % width;
            const curRow = Math.floor(cur / width);
            const curDist = this.dist[cur];

            // Pass 1: cheapest way onward. Pass 2: first neighbour (in this side's order) within
            // the remaining slack of it. Only strictly-closer neighbours count, and those are
            // always settled already, so the result depends on true distances alone.
            let bestCost = -1;
            let best = -1;
            for (let pass = 0; pass < 2 && best === -1; pass++) {
                for (let d = 0; d < 8; d++) {
                    const nextCol = curCol + dirX[d];
                    const nextRow = curRow + dirY[d];
                    if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= this.nav.height) continue;

                    const next = nextRow * width + nextCol;
                    if (this.settled[next] !== 1 || this.dist[next] >= curDist) continue;

                    const diagonal = dirX[d] !== 0 && dirY[d] !== 0;
                    if (
                        diagonal
                        && (!this.nav.isPassableIdx(this.profile, curRow * width + nextCol)
                            || !this.nav.isPassableIdx(this.profile, nextRow * width + curCol))
                    ) {
                        continue;
                    }

                    const total = this.dist[next] + stepMoveCost(this.nav.stepCost(this.profile, next), diagonal);
                    if (pass === 0) {
                        if (bestCost === -1 || total < bestCost) bestCost = total;
                    } else if (total - bestCost <= slack) {
                        best = next;
                        slack -= total - bestCost;
                        break;
                    }
                }
                if (bestCost === -1) return null; // No closer neighbour: cannot happen for a settled cell.
            }
            if (best === -1) return null;

            chain.push(best);
            cur = best;
        }

        return chain;
    }

    /**
     * Relax all 8 neighbours of a settled cell.
     */
    private relaxNeighbours(u: number): void {
        const uCol = u % this.nav.width;
        const uRow = Math.floor(u / this.nav.width);
        const uDist = this.dist[u];

        for (let d = 0; d < 8; d++) {
            const nCol = uCol + DIR_X_SIDE0[d];
            const nRow = uRow + DIR_Y_SIDE0[d];

            if (nCol < 0 || nCol >= this.nav.width || nRow < 0 || nRow >= this.nav.height) {
                continue;
            }

            const n = nRow * this.nav.width + nCol;

            // Skip settled.
            if (this.settled[n]) {
                continue;
            }

            // Passability.
            if (!this.nav.isPassableIdx(this.profile, n)) {
                continue;
            }

            // Diagonal corner rule.
            if (DIR_X_SIDE0[d] !== 0 && DIR_Y_SIDE0[d] !== 0) {
                const orth1 = uRow * this.nav.width + nCol;
                const orth2 = nRow * this.nav.width + uCol;
                if (!this.nav.isPassableIdx(this.profile, orth1) || !this.nav.isPassableIdx(this.profile, orth2)) {
                    continue;
                }
            }

            // Cost: we're stepping FROM n INTO u, so use u's step cost.
            const diagonal = DIR_X_SIDE0[d] !== 0 && DIR_Y_SIDE0[d] !== 0;
            const moveCost = stepMoveCost(this.nav.stepCost(this.profile, u), diagonal);
            const candidate = uDist + moveCost;

            if (!this.seen[n]) {
                // First time seeing n.
                this.dist[n] = candidate;
                this.seen[n] = 1;
                this.heap.push(n);
            } else if (candidate < this.dist[n]) {
                // Found a better path to n.
                this.dist[n] = candidate;
                this.heap.update(n);
            }
        }
    }
}
