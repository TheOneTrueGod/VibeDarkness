/**
 * MVP CrowdSpacing tuning knobs.
 * Soft radius packing — not rigid physics. Tune later in follow-on docs; keep call sites free of magic numbers.
 */

import { CELL_SIZE } from '../../terrain/TerrainGrid';

/** Ignore overlaps smaller than this (world px). */
export const CROWD_SPACING_OVERLAP_EPSILON = 0.5;

/**
 * Extra CrowdSpacing collision radius for player-controlled units (world px).
 * Does not change display / unit.radius — only how far softs are kept away.
 */
export const CROWD_SPACING_PLAYER_RADIUS_PADDING = 10;

/**
 * Fallback uniform-grid cell size when max participating radius is unknown.
 * Large enough that a typical unit spans ≤ ~2×2 cells.
 */
export const CROWD_SPACING_FALLBACK_CELL_SIZE = CELL_SIZE * 2;

/** Separation passes per tick (residual overlap OK until the next tick). */
export const CROWD_SPACING_PASSES_PER_TICK = 1;

/**
 * Cell size for a full grid rebuild: `2 * maxParticipatingRadius`, or the fallback when max ≤ 0.
 */
export function crowdSpacingCellSizeFromMaxRadius(maxParticipatingRadius: number): number {
    if (!(maxParticipatingRadius > 0)) return CROWD_SPACING_FALLBACK_CELL_SIZE;
    return 2 * maxParticipatingRadius;
}
