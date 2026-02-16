/**
 * Pathfinding - A* pathfinding on the terrain grid with caching.
 *
 * Computes grid-level paths from start to goal, respecting terrain
 * passability and weights. Paths are cached by (start, goal) cell pair.
 * Uses 8-directional movement with diagonal blocking checks.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TERRAIN_PROPERTIES } from './TerrainType';

/** A node in the A* open set. */
interface PathNode {
    col: number;
    row: number;
    /** Cost from start to this node. */
    g: number;
    /** Heuristic estimate from this node to goal. */
    h: number;
    /** Total estimated cost (g + h). */
    f: number;
    /** Parent node in the path. */
    parent: PathNode | null;
}

/** 8-directional offsets: cardinal then diagonal. */
const DIRS: { dc: number; dr: number }[] = [
    { dc: 0, dr: -1 },  // N
    { dc: 1, dr: 0 },   // E
    { dc: 0, dr: 1 },   // S
    { dc: -1, dr: 0 },  // W
    { dc: 1, dr: -1 },  // NE
    { dc: 1, dr: 1 },   // SE
    { dc: -1, dr: 1 },  // SW
    { dc: -1, dr: -1 }, // NW
];

export class Pathfinder {
    private grid: TerrainGrid;
    private cache: Map<string, { x: number; y: number }[] | null> = new Map();

    constructor(grid: TerrainGrid) {
        this.grid = grid;
    }

    /** Clear the path cache (call if terrain changes). */
    clearCache(): void {
        this.cache.clear();
    }

    /**
     * Find a path from world coordinates to world coordinates.
     * Returns an array of world-space waypoints, or null if no path exists.
     * The first waypoint is near the start; the last is the destination.
     */
    findPath(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
    ): { x: number; y: number }[] | null {
        const start = this.grid.worldToGrid(fromX, fromY);
        const end = this.grid.worldToGrid(toX, toY);

        // If destination is impassable, find nearest passable cell
        if (!TERRAIN_PROPERTIES[this.grid.get(end.col, end.row)].passable) {
            const nearest = this.findNearestPassable(end.col, end.row);
            if (!nearest) return null;
            end.col = nearest.col;
            end.row = nearest.row;
        }

        // Check cache
        const cacheKey = `${start.col},${start.row}->${end.col},${end.row}`;
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)!;
            return cached ? [...cached] : null;
        }

        // Same cell — just go to the destination
        if (start.col === end.col && start.row === end.row) {
            const result = [{ x: toX, y: toY }];
            this.cache.set(cacheKey, result);
            return [...result];
        }

        // Run A*
        const gridPath = this.astar(start.col, start.row, end.col, end.row);

        if (gridPath) {
            // Convert grid path to world coordinates (cell centers)
            const worldPath = gridPath.map((p) => this.grid.gridToWorld(p.col, p.row));
            // Replace the last waypoint with the exact destination
            worldPath[worldPath.length - 1] = { x: toX, y: toY };
            // Smooth by removing redundant colinear waypoints
            const smoothed = this.smoothPath(worldPath);
            this.cache.set(cacheKey, smoothed);
            return [...smoothed];
        }

        this.cache.set(cacheKey, null);
        return null;
    }

    /**
     * A* algorithm on the grid. Returns grid-coordinate path or null.
     */
    private astar(
        startCol: number,
        startRow: number,
        endCol: number,
        endRow: number,
    ): { col: number; row: number }[] | null {
        const openSet: PathNode[] = [];
        const closedSet = new Set<number>();

        const startNode: PathNode = {
            col: startCol,
            row: startRow,
            g: 0,
            h: this.heuristic(startCol, startRow, endCol, endRow),
            f: 0,
            parent: null,
        };
        startNode.f = startNode.g + startNode.h;
        openSet.push(startNode);

        const W = this.grid.width;

        while (openSet.length > 0) {
            // Find the node with lowest f cost
            let lowestIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if (
                    openSet[i].f < openSet[lowestIdx].f ||
                    (openSet[i].f === openSet[lowestIdx].f && openSet[i].h < openSet[lowestIdx].h)
                ) {
                    lowestIdx = i;
                }
            }
            const current = openSet.splice(lowestIdx, 1)[0];

            // Goal reached
            if (current.col === endCol && current.row === endRow) {
                return this.reconstructPath(current);
            }

            const currentKey = current.row * W + current.col;
            closedSet.add(currentKey);

            // Explore neighbors
            for (const dir of DIRS) {
                const nc = current.col + dir.dc;
                const nr = current.row + dir.dr;

                // Bounds check
                if (nc < 0 || nc >= this.grid.width || nr < 0 || nr >= this.grid.height) continue;

                const neighborKey = nr * W + nc;
                if (closedSet.has(neighborKey)) continue;

                const terrain = this.grid.get(nc, nr);
                const props = TERRAIN_PROPERTIES[terrain];
                if (!props.passable) continue;

                // Diagonal: both adjacent cardinal cells must be passable
                const isDiagonal = dir.dc !== 0 && dir.dr !== 0;
                if (isDiagonal) {
                    if (!TERRAIN_PROPERTIES[this.grid.get(current.col + dir.dc, current.row)].passable) continue;
                    if (!TERRAIN_PROPERTIES[this.grid.get(current.col, current.row + dir.dr)].passable) continue;
                }

                const moveCost = (isDiagonal ? Math.SQRT2 : 1) * props.pathfindingWeight;
                const g = current.g + moveCost;

                // Check if already in open set with a lower cost
                const existing = openSet.find((n) => n.col === nc && n.row === nr);
                if (existing) {
                    if (existing.g <= g) continue;
                    // Update to better path
                    existing.g = g;
                    existing.f = g + existing.h;
                    existing.parent = current;
                } else {
                    const h = this.heuristic(nc, nr, endCol, endRow);
                    openSet.push({
                        col: nc,
                        row: nr,
                        g,
                        h,
                        f: g + h,
                        parent: current,
                    });
                }
            }
        }

        return null; // No path found
    }

    /** Octile distance heuristic (supports 8-directional movement). */
    private heuristic(c1: number, r1: number, c2: number, r2: number): number {
        const dx = Math.abs(c1 - c2);
        const dy = Math.abs(r1 - r2);
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    }

    /** Reconstruct the path by following parent pointers. */
    private reconstructPath(node: PathNode): { col: number; row: number }[] {
        const path: { col: number; row: number }[] = [];
        let current: PathNode | null = node;
        while (current) {
            path.unshift({ col: current.col, row: current.row });
            current = current.parent;
        }
        return path;
    }

    /**
     * Smooth a world-coordinate path by removing waypoints where a direct
     * line of sight exists between non-adjacent points.
     */
    private smoothPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
        if (path.length <= 2) return path;

        const smoothed: { x: number; y: number }[] = [path[0]];

        for (let i = 1; i < path.length - 1; i++) {
            const prev = smoothed[smoothed.length - 1];
            const next = path[i + 1];

            // Keep waypoint if no line of sight to the one after it
            if (!this.hasLineOfSight(prev.x, prev.y, next.x, next.y)) {
                smoothed.push(path[i]);
            }
        }

        smoothed.push(path[path.length - 1]);
        return smoothed;
    }

    /** Check if a straight line passes only through passable terrain. */
    private hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // Sample every half-cell to avoid missing thin walls
        const steps = Math.ceil(dist / (this.grid.cellSize * 0.5));

        for (let i = 0; i <= steps; i++) {
            const t = steps === 0 ? 0 : i / steps;
            const x = x1 + dx * t;
            const y = y1 + dy * t;
            if (!this.grid.isPassable(x, y)) return false;
        }

        return true;
    }

    /** Find nearest passable cell using BFS from an impassable cell. */
    private findNearestPassable(col: number, row: number): { col: number; row: number } | null {
        const visited = new Set<number>();
        const queue: { col: number; row: number }[] = [{ col, row }];
        const W = this.grid.width;
        visited.add(row * W + col);

        while (queue.length > 0) {
            const current = queue.shift()!;

            if (TERRAIN_PROPERTIES[this.grid.get(current.col, current.row)].passable) {
                return current;
            }

            for (const { dc, dr } of DIRS.slice(0, 4)) {
                const nc = current.col + dc;
                const nr = current.row + dr;
                const key = nr * W + nc;
                if (
                    !visited.has(key) &&
                    nc >= 0 && nc < this.grid.width &&
                    nr >= 0 && nr < this.grid.height
                ) {
                    visited.add(key);
                    queue.push({ col: nc, row: nr });
                }
            }
        }

        return null;
    }
}
