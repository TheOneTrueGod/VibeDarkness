/**
 * Pluggable CrowdSpacing resolver. {@link CrowdSpacingManager} owns the grid + contacts and
 * delegates participation, radius and the per-tick resolve to one of these.
 * Pick the default via `createCrowdSpacingResolver()` in `crowdSpacingMode.ts` — never branch on
 * the mode anywhere else.
 */

import type { Unit } from '../units/Unit';
import type { TerrainManager } from '../../terrain/TerrainManager';
import type { CrowdSpacingGrid } from './shared/CrowdSpacingGrid';
import type { CrowdSpacingMode } from './crowdSpacingMode';

export type CrowdSpacingResolveArgs = {
    /** Units already synced into `grid` this tick (all pass `isParticipant`). */
    participants: readonly Unit[];
    grid: CrowdSpacingGrid;
    terrainManager: TerrainManager | null;
    /** World tick step (seconds; `worldPace × FIXED_DT`). Unit-local steps live on `unit.localStep`. */
    dt: number;
    /** World time this tick (`engine.gameTime`) — cast-elapsed fallback for units without a local clock. */
    gameTime: number;
    /**
     * Unit positions recorded before any unit moved this tick (`CrowdSpacingManager.beginTick`).
     * Runtime-only. A unit missing from the map (or the map absent) counts as not having moved.
     */
    tickStartPositions?: ReadonlyMap<string, { readonly x: number; readonly y: number }>;
    /** Called once per overlapping pair (deterministic id order) — the "bump" signal. */
    onContact: (a: Unit, b: Unit) => void;
};

export interface CrowdSpacingResolver {
    readonly mode: CrowdSpacingMode;
    /** Whether the unit is in the grid this tick. */
    isParticipant(unit: Unit): boolean;
    /** CrowdSpacing collision radius (grid + overlap). */
    radius(unit: Unit): number;
    resolve(args: CrowdSpacingResolveArgs): void;
}
