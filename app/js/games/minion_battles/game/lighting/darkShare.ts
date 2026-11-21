/**
 * Darkness share: how much of the arena is in full darkness. Used to scale continuous spawns.
 *
 * Costs one pass over the grid, so call it only when a spawn check actually runs (never per tick).
 * Reads the same per-cell light the `inDarkness` spawn placement reads, so the two agree, and it
 * depends only on simulation state, so every client computes the same value.
 */

import { DarknessLevel } from '../darknessLevels';
import type { EngineContext } from '../EngineContext';

export type DarkShareContext = Pick<EngineContext, 'terrainManager' | 'lightLevelEnabled' | 'getLightAt'>;

/**
 * Share (0..1) of passable tiles in full darkness. 0 when the light system is off or there is no terrain.
 */
export function darkShare(ctx: DarkShareContext): number {
    const terrainManager = ctx.terrainManager;
    if (!terrainManager || !ctx.lightLevelEnabled) return 0;
    const grid = terrainManager.grid;
    let passable = 0;
    let dark = 0;
    for (let row = 0; row < grid.height; row++) {
        for (let col = 0; col < grid.width; col++) {
            const { x, y } = grid.gridToWorld(col, row);
            if (!terrainManager.isPassable(x, y)) continue;
            passable++;
            const level = ctx.getLightAt(col, row);
            if (level != null && level <= DarknessLevel.FULL_DARKNESS) dark++;
        }
    }
    return passable === 0 ? 0 : dark / passable;
}

/** Linear interpolation from `atMin` (share = minShare) to `atFull` (share = 1). */
export function lerpByShare(atMin: number, atFull: number, share: number, minShare: number): number {
    const span = 1 - minShare;
    const t = span <= 0 ? 1 : Math.min(1, Math.max(0, (share - minShare) / span));
    return atMin + (atFull - atMin) * t;
}
