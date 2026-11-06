/**
 * Fitting formation slots onto the map: a slot that lands off the map or inside a wall moves to the
 * centre of the nearest open cell. Kept apart from `formationDef.ts` so the shapes stay pure.
 */

import type { TerrainManager } from '../../terrain/TerrainManager';
import { findNearestPassableCell } from '../forceMove';
import type { FormationPoint } from './formationDef';

/** Move every slot that is out of bounds or impassable to the nearest passable cell centre. */
export function fitSlotsToTerrain(
    slots: readonly FormationPoint[],
    terrainManager: TerrainManager | null | undefined,
): FormationPoint[] {
    if (!terrainManager) return slots.map((s) => ({ ...s }));
    const { width, height, cellSize } = terrainManager.getGridSize();
    const maxX = width * cellSize - 1;
    const maxY = height * cellSize - 1;
    return slots.map((s) => {
        const x = Math.max(0, Math.min(maxX, s.x));
        const y = Math.max(0, Math.min(maxY, s.y));
        if (terrainManager.isPassable(x, y)) return { x, y };
        const cell = findNearestPassableCell(terrainManager, Math.floor(x / cellSize), Math.floor(y / cellSize));
        if (!cell) return { x, y };
        return { x: cell.col * cellSize + cellSize / 2, y: cell.row * cellSize + cellSize / 2 };
    });
}
