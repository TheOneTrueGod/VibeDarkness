/**
 * CrowdSpacing participation: who is exempt / soft / anchor, and spacing weight.
 */

import type { Unit } from '../units/Unit';
import { UnitTag, hasUnitTag } from '../units/unitTag';
import { isUnitAirborne } from '../terrainEffects/tileTransitions';
import { CROWD_SPACING_PLAYER_RADIUS_PADDING } from './crowdSpacingConstants';

export type CrowdSpacingRole = 'exempt' | 'soft' | 'anchor';

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
 * How hard a unit resists being moved by CrowdSpacing.
 * MVP: weight = radius. Mass / override may replace this later without changing call sites.
 */
export function getCrowdSpacingWeight(unit: Unit): number {
    return unit.radius;
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
 * Participation role for CrowdSpacing.
 * Dead / inactive / spawning / airborne → exempt (not in the grid).
 * Mid dash/lunge (`abilityOwnsMovementThisTick`) → exempt so the caster ghosts through the pack.
 * CrowdSpacingExempt tag → exempt (fixed test-fixture probes; see UnitTag doc).
 * Players, CrowdSpacingAnchor tag, and forced-movers → anchor.
 * Everyone else grounded and alive → soft.
 */
export function getCrowdSpacingRole(unit: Unit): CrowdSpacingRole {
    if (!unit.isAlive() || unit.isSpawning()) return 'exempt';
    if (isUnitAirborne(unit)) return 'exempt';
    if (unit.abilityOwnsMovementThisTick) return 'exempt';
    if (hasUnitTag(unit, UnitTag.CrowdSpacingExempt)) return 'exempt';
    if (
        unit.isPlayerControlled() ||
        hasUnitTag(unit, UnitTag.CrowdSpacingAnchor) ||
        isCrowdSpacingForcedMover(unit)
    ) {
        return 'anchor';
    }
    return 'soft';
}
