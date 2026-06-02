import type { TerrainManager } from '../terrain/TerrainManager';
import type { TerrainGrid } from '../terrain/TerrainGrid';

/**
 * BFS from a grid cell to find the nearest cell whose center is passable.
 * Returns grid coords of the nearest passable cell, or null if none found.
 */
export function findNearestPassableCell(
    grid: TerrainGrid,
    col: number,
    row: number,
): { col: number; row: number } | null {
    const W = grid.width;
    const H = grid.height;
    const clampedCol = Math.max(0, Math.min(W - 1, col));
    const clampedRow = Math.max(0, Math.min(H - 1, row));

    const visited = new Set<number>();
    const queue: { col: number; row: number }[] = [{ col: clampedCol, row: clampedRow }];
    visited.add(clampedRow * W + clampedCol);

    while (queue.length > 0) {
        const current = queue.shift()!;
        const cx = current.col * grid.cellSize + grid.cellSize / 2;
        const cy = current.row * grid.cellSize + grid.cellSize / 2;
        if (grid.isPassable(cx, cy)) {
            return current;
        }
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
            const nc = current.col + dc;
            const nr = current.row + dr;
            const key = nr * W + nc;
            if (!visited.has(key) && nc >= 0 && nc < W && nr >= 0 && nr < H) {
                visited.add(key);
                queue.push({ col: nc, row: nr });
            }
        }
    }
    return null;
}

type PassableFn = (x: number, y: number) => boolean;

interface ForceMoveOptions {
    terrainManager?: TerrainManager | null;
    grid?: TerrainGrid | null;
    /** Step size in pixels when probing along the movement path. */
    step?: number;
}

export interface ForcedDisplacement {
    /** X-axis delta to apply (world units). */
    dx: number;
    /** Y-axis delta to apply (world units). */
    dy: number;
    /** Total distance moved along the path. */
    distance: number;
}

/**
 * Compute how far a unit can be forcibly moved toward a target position without entering
 * an unpassable tile. Uses either TerrainManager or TerrainGrid for passability checks.
 *
 * The caller is responsible for actually applying the returned displacement to the unit.
 */
export function computeForcedDisplacement(
    startX: number,
    startY: number,
    towardX: number,
    towardY: number,
    maxDistance: number,
    options: ForceMoveOptions = {},
): ForcedDisplacement {
    const dxTotal = towardX - startX;
    const dyTotal = towardY - startY;
    const distToTarget = Math.sqrt(dxTotal * dxTotal + dyTotal * dyTotal);

    if (distToTarget === 0 || maxDistance <= 0) {
        return { dx: 0, dy: 0, distance: 0 };
    }

    const desired = Math.min(maxDistance, distToTarget);
    const ux = dxTotal / distToTarget;
    const uy = dyTotal / distToTarget;

    const passable: PassableFn | null =
        options.terrainManager
            ? (x, y) => options.terrainManager!.isPassable(x, y)
            : options.grid
                ? (x, y) => options.grid!.isPassable(x, y)
                : null;

    // If we have no passability information, just move the full desired distance.
    if (!passable) {
        const dx = ux * desired;
        const dy = uy * desired;
        return { dx, dy, distance: desired };
    }

    const step = Math.max(1, Math.min(options.step ?? 4, desired));
    let safeDistance = 0;

    for (let d = step; d <= desired; d += step) {
        const x = startX + ux * d;
        const y = startY + uy * d;
        if (!passable(x, y)) {
            break;
        }
        safeDistance = d;
    }

    if (safeDistance <= 0) {
        return { dx: 0, dy: 0, distance: 0 };
    }

    const dx = ux * safeDistance;
    const dy = uy * safeDistance;
    return { dx, dy, distance: safeDistance };
}

