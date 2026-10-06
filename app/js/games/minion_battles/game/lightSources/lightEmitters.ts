/**
 * Common definition of a "light emitter" an ability can reach: an active, positive-emission,
 * non-base light source inside the 5×5-tile square centered on the caster.
 * Shared by Devour Light (Gather Light) and Lay Hands so both always agree on what counts.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';
import type { LightSource } from './LightSource';
import type { LightSourceManager } from './LightSourceManager';

/** Reach of the 5×5-tile square centered on the caster (2 tiles each side of the center tile). */
export const LIGHT_EMITTER_REACH_HALF_EXTENT = 2 * CELL_SIZE;

/** Reachable emitters, nearest-first with a stable id tie-break. */
export function findReachableLightEmitters(
    mgr: LightSourceManager,
    x: number,
    y: number,
): LightSource[] {
    return mgr.findDevourableLightSources(x, y, LIGHT_EMITTER_REACH_HALF_EXTENT);
}

/** Nearest reachable emitter, or null when none are in reach. */
export function findNearestReachableLightEmitter(
    mgr: LightSourceManager | undefined,
    x: number,
    y: number,
): LightSource | null {
    if (!mgr) return null;
    return findReachableLightEmitters(mgr, x, y)[0] ?? null;
}
