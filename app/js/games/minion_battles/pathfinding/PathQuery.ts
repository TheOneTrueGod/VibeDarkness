/**
 * PathQuery - Unified pathfinding facade over A*, smoothing, and line-of-walk.
 *
 * Provides high-level path queries: findPath (world px → cell), findCellPath (cell → cell),
 * isReachable, hasLineOfWalk. Owns memoization of findCellPath results, invalidated per navEpoch.
 */

import type { TerrainManager } from '../terrain/TerrainManager';
import type { NavProfileId } from './navProfile';
import { hasLineOfWalk } from './lineOfWalk';
import { aStar } from './search/aStar';
import { GoalField } from './search/GoalField';
import { smoothPath } from './smoothing';
import { CELL_SIZE } from '../terrain/TerrainGrid';

export interface PathQueryWaypoint {
    col: number;
    row: number;
}

/** LRU cache size for goal fields. */
export const GOAL_FIELD_CACHE_SIZE = 16;

export class PathQuery {
    private terrainManager: TerrainManager;
    /** findCellPath memo, keyed by a number packing (fromIdx, toIdx, profile, side). Pure memoization. */
    private cellPathMemo: Map<number, PathQueryWaypoint[] | null> = new Map();
    private cacheEpoch = 0;

    /** LRU cache for GoalField, keyed by goalIdx * 2 + (profile === 'enemy' ? 1 : 0). */
    private goalFieldCache: Map<number, GoalField> = new Map();
    private goalFieldCacheEpoch = 0;

    constructor(terrainManager: TerrainManager) {
        this.terrainManager = terrainManager;
    }

    /**
     * Find the nearest passable cell to (col, row).
     * Returns the cell itself if passable; otherwise a breadth-first search over cardinal neighbors
     * (N, E, S, W; always in that fixed order) returning the first passable cell found.
     * Returns null if no passable cell is found.
     */
    nearestPassable(profile: NavProfileId, col: number, row: number): PathQueryWaypoint | null {
        const nav = this.terrainManager.nav;

        // Check if the cell itself is passable.
        if (nav.isPassable(profile, col, row)) {
            return { col, row };
        }

        // BFS over 4 cardinal neighbors (N, E, S, W).
        const visited = new Uint8Array(nav.width * nav.height);
        const queue: Array<{ col: number; row: number }> = [{ col, row }];
        if (col >= 0 && col < nav.width && row >= 0 && row < nav.height) {
            visited[row * nav.width + col] = 1;
        }

        const neighbors = [
            { dc: 0, dr: -1 }, // N
            { dc: 1, dr: 0 },  // E
            { dc: 0, dr: 1 },  // S
            { dc: -1, dr: 0 }, // W
        ];

        let head = 0;
        while (head < queue.length) {
            const current = queue[head++]!;

            for (const { dc, dr } of neighbors) {
                const nc = current.col + dc;
                const nr = current.row + dr;

                // Check bounds.
                if (nc < 0 || nc >= nav.width || nr < 0 || nr >= nav.height) continue;

                const idx = nr * nav.width + nc;
                if (visited[idx]) continue;
                visited[idx] = 1;

                if (nav.isPassable(profile, nc, nr)) {
                    return { col: nc, row: nr };
                }

                queue.push({ col: nc, row: nr });
            }
        }

        return null;
    }

    /**
     * Find a path from world pixel (fromX, fromY) to grid cell (toCol, toRow).
     *
     * @param fromX Start world X coordinate.
     * @param fromY Start world Y coordinate.
     * @param toCol Goal column.
     * @param toRow Goal row.
     * @param profile Nav profile ('default' or 'enemy').
     * @param side Determinism seed for tie-breaking (0 or 1).
     * @param lane Per-unit lane spreading (0..1) for corner widening. Defaults to 0.
     * @returns Array of waypoints (goal last), or null if unreachable.
     */
    findPath(
        fromX: number,
        fromY: number,
        toCol: number,
        toRow: number,
        profile: NavProfileId,
        side: 0 | 1,
        lane: number = 0,
    ): PathQueryWaypoint[] | null {
        return this.plan(fromX, fromY, toCol, toRow, profile, side, false, lane);
    }

    /**
     * Shared planning: snap the goal, rescue a start inside a wall, then try the cheap answers
     * (same cell, straight line) before running a search. `sharedGoal` picks the search: a
     * GoalField shared by everyone heading for that cell, or a one-off A*. The choice is made by
     * the caller from the kind of goal, never from cache contents (determinism rule).
     */
    private plan(
        fromX: number,
        fromY: number,
        toCol: number,
        toRow: number,
        profile: NavProfileId,
        side: 0 | 1,
        sharedGoal: boolean,
        lane: number = 0,
    ): PathQueryWaypoint[] | null {
        const nav = this.terrainManager.nav;

        const goal = this.nearestPassable(profile, toCol, toRow);
        if (!goal) return null;

        const startCol = Math.floor(fromX / CELL_SIZE);
        const startRow = Math.floor(fromY / CELL_SIZE);

        // A unit pushed into a wall starts from the nearest passable cell; that cell becomes the
        // first waypoint so it walks out before following the rest of the path.
        if (!nav.isPassable(profile, startCol, startRow)) {
            const nearStart = this.nearestPassable(profile, startCol, startRow);
            if (!nearStart) return null;
            const rest = this.plan(
                nearStart.col * CELL_SIZE + CELL_SIZE / 2,
                nearStart.row * CELL_SIZE + CELL_SIZE / 2,
                toCol,
                toRow,
                profile,
                side,
                sharedGoal,
                lane,
            );
            return rest === null ? null : [nearStart, ...rest];
        }

        if (startCol === goal.col && startRow === goal.row) {
            return [];
        }

        // Direct line of walk: go straight there, no search.
        const goalX = goal.col * CELL_SIZE + CELL_SIZE / 2;
        const goalY = goal.row * CELL_SIZE + CELL_SIZE / 2;
        if (hasLineOfWalk(nav, profile, fromX, fromY, goalX, goalY)) {
            return [goal];
        }

        const startIdx = startRow * nav.width + startCol;
        const goalIdx = goal.row * nav.width + goal.col;
        const chain = sharedGoal
            ? this.getOrCreateGoalField(profile, goalIdx).extractChain(startIdx, side)
            : aStar(nav, profile, startIdx, goalIdx, side);
        if (!chain) return null;

        return smoothPath(nav, profile, fromX, fromY, chain, lane);
    }

    /**
     * Find a path from grid cell (fromCol, fromRow) to grid cell (toCol, toRow).
     * Anchored at cell centres. **Memoized**: a cache hit and a cold call return identical results.
     * Never lane-widened (the memo key has no lane); used for explicit player/UI paths.
     * Always returns a fresh copy so callers can mutate it.
     *
     * @param fromCol Start column.
     * @param fromRow Start row.
     * @param toCol Goal column.
     * @param toRow Goal row.
     * @param profile Nav profile.
     * @param side Determinism seed.
     * @returns Array of waypoints (goal last), or null if unreachable.
     */
    findCellPath(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
        profile: NavProfileId,
        side: 0 | 1,
    ): PathQueryWaypoint[] | null {
        const nav = this.terrainManager.nav;

        // Invalidate memo if epoch changed.
        if (this.cacheEpoch !== this.terrainManager.navEpoch) {
            this.cellPathMemo.clear();
            this.cacheEpoch = this.terrainManager.navEpoch;
        }

        const fromIdx = fromRow * nav.width + fromCol;
        const toIdx = toRow * nav.width + toCol;
        const key = ((fromIdx * nav.width * nav.height + toIdx) * 2 + (profile === 'enemy' ? 1 : 0)) * 2 + side;

        // Check memo.
        if (this.cellPathMemo.has(key)) {
            const cached = this.cellPathMemo.get(key)!;
            // Return a fresh copy.
            return cached === null ? null : cached.map((p) => ({ ...p }));
        }

        const fromX = fromCol * CELL_SIZE + CELL_SIZE / 2;
        const fromY = fromRow * CELL_SIZE + CELL_SIZE / 2;
        const result = this.findPath(fromX, fromY, toCol, toRow, profile, side);

        // Store in memo (grow and evict if necessary).
        if (this.cellPathMemo.size >= 4096) {
            this.cellPathMemo.clear();
        }
        this.cellPathMemo.set(key, result);

        // Return a fresh copy.
        return result === null ? null : result.map((p) => ({ ...p }));
    }

    /**
     * Check if a goal cell is reachable from a start cell.
     */
    isReachable(
        profile: NavProfileId,
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
    ): boolean {
        const nav = this.terrainManager.nav;

        // Both cells must be passable.
        if (!nav.isPassable(profile, fromCol, fromRow) || !nav.isPassable(profile, toCol, toRow)) {
            return false;
        }

        // Check if they're in the same connected component.
        const fromIdx = fromRow * nav.width + fromCol;
        const toIdx = toRow * nav.width + toCol;
        return nav.sameComponent(profile, fromIdx, toIdx);
    }

    /**
     * Check if there is line of walk (a walkable straight path) between two world positions.
     */
    hasLineOfWalk(
        profile: NavProfileId,
        x0: number,
        y0: number,
        x1: number,
        y1: number,
    ): boolean {
        const nav = this.terrainManager.nav;
        return hasLineOfWalk(nav, profile, x0, y0, x1, y1);
    }

    /**
     * Find a path from world pixel (fromX, fromY) to grid cell (toCol, toRow)
     * using a shared goal-rooted Dijkstra field (cached and reused across queries).
     *
     * @param fromX Start world X coordinate.
     * @param fromY Start world Y coordinate.
     * @param goalCol Goal column.
     * @param goalRow Goal row.
     * @param profile Nav profile ('default' or 'enemy').
     * @param side Determinism seed for tie-breaking (0 or 1).
     * @param lane Per-unit lane spreading (0..1) for corner widening. Defaults to 0.
     * @returns Array of waypoints (goal last), or null if unreachable.
     */
    findPathToSharedGoal(
        fromX: number,
        fromY: number,
        goalCol: number,
        goalRow: number,
        profile: NavProfileId,
        side: 0 | 1,
        lane: number = 0,
    ): PathQueryWaypoint[] | null {
        return this.plan(fromX, fromY, goalCol, goalRow, profile, side, true, lane);
    }

    /**
     * Get or create a GoalField for a given goal, using an LRU cache.
     * Clears the cache if navEpoch has changed.
     */
    private getOrCreateGoalField(profile: NavProfileId, goalIdx: number): GoalField {
        const nav = this.terrainManager.nav;

        // Invalidate cache if epoch changed.
        if (this.goalFieldCacheEpoch !== this.terrainManager.navEpoch) {
            this.goalFieldCache.clear();
            this.goalFieldCacheEpoch = this.terrainManager.navEpoch;
        }

        // Pack cache key: goalIdx * 2 + (profile === 'enemy' ? 1 : 0)
        const key = goalIdx * 2 + (profile === 'enemy' ? 1 : 0);

        // Check cache.
        if (this.goalFieldCache.has(key)) {
            // Hit: move to end (most recent).
            const field = this.goalFieldCache.get(key)!;
            this.goalFieldCache.delete(key);
            this.goalFieldCache.set(key, field);
            return field;
        }

        // Miss: create new field.
        const field = new GoalField(nav, profile, goalIdx);

        // Evict oldest if at capacity.
        if (this.goalFieldCache.size >= GOAL_FIELD_CACHE_SIZE) {
            const firstKey = this.goalFieldCache.keys().next().value as number;
            this.goalFieldCache.delete(firstKey);
        }

        // Insert (most recent).
        this.goalFieldCache.set(key, field);
        return field;
    }

    /**
     * Get the current number of cached goal fields (for testing).
     */
    get goalFieldCount(): number {
        return this.goalFieldCache.size;
    }

    /**
     * Clear the findCellPath memo cache.
     */
    clearCache(): void {
        this.cellPathMemo.clear();
        this.cacheEpoch = 0;
        this.goalFieldCache.clear();
        this.goalFieldCacheEpoch = 0;
    }
}
