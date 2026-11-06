/**
 * Tuning knobs for the CrowdSpacing **mass** resolver. Tune these, not resolver code.
 * Read only by `mass/` (never branch on the active resolver elsewhere).
 */

import { UNIT_SIZE_MAP, type UnitSize } from '../../units/unit_defs/unitConstants';

/**
 * CrowdSpacing mass per size tier. Scales much faster than radius so size clearly matters:
 * a Large unit (radius 22 vs 20) is twice as heavy as a Medium one.
 */
export const CROWD_MASS_BY_SIZE: Record<UnitSize, number> = {
    Minuscule: 0.3,
    Diminutive: 0.4,
    Tiny: 0.5,
    'Extra Small': 0.65,
    Small: 0.75,
    Medium: 1,
    Large: 2,
    'Extra Large': 3,
    Giant: 5,
    Colossal: 8,
};

/**
 * Size tiers added to a player's own character when looking up its mass (1 = weighs as one size
 * larger: a Medium player has Large mass). Makes players steadier and better at shoving.
 */
export const CROWD_MASS_PLAYER_SIZE_TIER_BONUS = 1;

/** Mass multiplier for units tagged `UnitTag.Boss`. */
export const CROWD_MASS_BOSS_MULTIPLIER = 3;

/**
 * Team resistance: in a cross-team pair, each unit that is **not** a pusher has its push budget
 * divided by this (allies are unaffected). Mass stays size-only.
 */
export const CROWD_MASS_ENEMY_RESISTANCE = 3;

/**
 * World px a unit must have moved this tick toward its partner (displacement since the
 * pre-movement snapshot, dotted with the pair normal) to count as the pair's pusher.
 */
export const CROWD_MASS_PUSHER_EPSILON = 0.05;

/** Per-tick push budget as a fraction of the unit's own move speed: `fraction × speed × dt`. */
export const CROWD_MASS_PUSH_BUDGET_SPEED_FRACTION = 0.6;

const SIZE_TIERS = Object.keys(UNIT_SIZE_MAP) as UnitSize[];

/** Size tier whose `UNIT_SIZE_MAP` radius is nearest to `radius` (ties go to the smaller tier). */
export function nearestUnitSizeForRadius(radius: number): UnitSize {
    let best: UnitSize = SIZE_TIERS[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const tier of SIZE_TIERS) {
        const d = Math.abs(UNIT_SIZE_MAP[tier] - radius);
        if (d < bestDist) {
            bestDist = d;
            best = tier;
        }
    }
    return best;
}

/** `tier` moved `steps` sizes up (negative = down), clamped to Minuscule..Colossal. */
export function shiftUnitSizeTier(tier: UnitSize, steps: number): UnitSize {
    const index = SIZE_TIERS.indexOf(tier) + Math.trunc(steps);
    return SIZE_TIERS[Math.max(0, Math.min(SIZE_TIERS.length - 1, index))];
}

/** Fallback mass for a unit with no size tier: the mass of the tier nearest its radius. */
export function crowdMassForRadius(radius: number): number {
    return CROWD_MASS_BY_SIZE[nearestUnitSizeForRadius(radius)];
}
