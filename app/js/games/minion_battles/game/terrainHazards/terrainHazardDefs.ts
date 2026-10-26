/**
 * Terrain hazard definitions — what happens to a unit forced onto a terrain type it cannot walk
 * on. A terrain type opts in with `TerrainProperties.forcedEntryHazard` (see `terrain/TerrainType.ts`).
 */

import type { TerrainHazardId } from '../../terrain/TerrainType';

export interface TerrainHazardDef {
    /** Seconds the unit spends in the hazard animation (untargetable, unable to act). */
    durationSeconds: number;
    /** Flat damage taken when the animation ends, after the unit is moved back onto walkable ground. */
    damage: number;
}

export const TERRAIN_HAZARD_DEFS: Record<TerrainHazardId, TerrainHazardDef> = {
    drown: {
        durationSeconds: 1,
        damage: 10,
    },
    /** Deep Water: the same sink, double damage. */
    drown_deep: {
        durationSeconds: 1,
        damage: 20,
    },
};
