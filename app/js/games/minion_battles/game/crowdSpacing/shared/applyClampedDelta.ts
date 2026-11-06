/**
 * Shared CrowdSpacing apply step: terrain-clamp a requested push, write the position, refresh the grid.
 */

import type { Unit } from '../../units/Unit';
import type { TerrainGrid } from '../../../terrain/TerrainGrid';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { clampNudgeVectorToTerrain } from '../../units/unitNudge';
import type { CrowdSpacingGrid } from './CrowdSpacingGrid';

export type Vec2 = { x: number; y: number };

export type ApplyClampedDeltaArgs = {
    unit: Unit;
    delta: Vec2;
    grid: CrowdSpacingGrid;
    /** CrowdSpacing radius used to re-insert the unit into the grid. */
    radius: number;
    terrainManager?: TerrainManager | null;
    /** Bedrock / passability grid when no TerrainManager is available. */
    terrainGrid?: TerrainGrid | null;
};

/**
 * Clamp `delta` to terrain, move the unit by the result and update its grid cells.
 * Returns the vector actually applied (`{0,0}` when nothing moved; the grid is untouched then).
 */
export function applyClampedCrowdSpacingDelta(args: ApplyClampedDeltaArgs): Vec2 {
    const { unit, delta, grid, radius, terrainManager, terrainGrid } = args;
    const clamped = clampNudgeVectorToTerrain(unit, delta, terrainManager, terrainGrid ?? null);
    if (clamped.x === 0 && clamped.y === 0) return { x: 0, y: 0 };

    unit.x += clamped.x;
    unit.y += clamped.y;
    grid.updateUnit(unit.id, unit.x, unit.y, radius);
    return { x: clamped.x, y: clamped.y };
}
