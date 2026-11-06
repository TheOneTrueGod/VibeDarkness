/**
 * CrowdSpacing participation: who is exempt / soft / anchor, and spacing weight.
 */

import type { Unit } from '../../units/Unit';
import { UnitTag, hasUnitTag } from '../../units/unitTag';
import {
    getCrowdSpacingRadius,
    isCrowdSpacingExempt,
    isCrowdSpacingForcedMover,
} from '../shared/crowdSpacingParticipation';

export { getCrowdSpacingRadius, isCrowdSpacingForcedMover };

export type CrowdSpacingRole = 'exempt' | 'soft' | 'anchor';

/**
 * How hard a unit resists being moved by CrowdSpacing.
 * MVP: weight = radius. Mass / override may replace this later without changing call sites.
 */
export function getCrowdSpacingWeight(unit: Unit): number {
    return unit.radius;
}

/**
 * Participation role for CrowdSpacing.
 * Exempt per {@link isCrowdSpacingExempt} (dead / untargetable, airborne, dash/lunge, CrowdSpacingExempt).
 * Players, CrowdSpacingAnchor, Structure, and forced-movers → anchor.
 * Everyone else grounded and alive → soft.
 */
export function getCrowdSpacingRole(unit: Unit): CrowdSpacingRole {
    if (isCrowdSpacingExempt(unit)) return 'exempt';
    if (
        unit.isPlayerControlled() ||
        hasUnitTag(unit, UnitTag.CrowdSpacingAnchor) ||
        hasUnitTag(unit, UnitTag.Structure) ||
        isCrowdSpacingForcedMover(unit)
    ) {
        return 'anchor';
    }
    return 'soft';
}
