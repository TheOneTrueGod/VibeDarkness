/**
 * CrowdSpacing participation rules shared by every resolver: who is exempt (not in the grid),
 * who is a forced mover, and the CrowdSpacing collision radius.
 */

import type { Unit } from '../../units/Unit';
import { UnitTag, hasUnitTag } from '../../units/unitTag';
import { isUnitAirborne } from '../../terrainEffects/tileTransitions';
import { CROWD_SPACING_PLAYER_RADIUS_PADDING } from '../crowdSpacingConstants';

/**
 * Collision radius used by CrowdSpacing (grid + overlap). Display `unit.radius` is unchanged.
 * Player-controlled units get a small personal-space padding so packs feel less claustrophobic.
 */
export function getCrowdSpacingRadius(unit: Unit): number {
    const base = unit.radius;
    if (unit.isPlayerControlled()) return base + CROWD_SPACING_PLAYER_RADIUS_PADDING;
    return base;
}

/**
 * Temporary non-displaced CrowdSpacing participants: knockback (incl. slide) and
 * engine-controlled sequences. Ability dash/lunge uses {@link Unit.abilityOwnsMovementThisTick}
 * instead — that path is exempt (does not occupy CrowdSpacing space).
 */
export function isCrowdSpacingForcedMover(unit: Unit): boolean {
    return unit.knockback != null || unit.controlled;
}

/**
 * Not in the CrowdSpacing grid this tick: dead / untargetable, airborne, mid dash/lunge
 * (`abilityOwnsMovementThisTick` — the caster ghosts through the pack), or tagged
 * `CrowdSpacingExempt` (fixed test-fixture probes; see UnitTag doc).
 */
export function isCrowdSpacingExempt(unit: Unit): boolean {
    if (!unit.isAlive() || unit.isUntargetable()) return true;
    if (isUnitAirborne(unit)) return true;
    if (unit.abilityOwnsMovementThisTick) return true;
    return hasUnitTag(unit, UnitTag.CrowdSpacingExempt);
}
