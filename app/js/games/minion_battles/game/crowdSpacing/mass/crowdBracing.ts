/**
 * CrowdSpacing bracing for the mass resolver: a braced unit acts as a wall this tick (infinite mass)
 * but still pushes others.
 */

import type { Unit } from '../../units/Unit';
import { UnitTag, hasUnitTag } from '../../units/unitTag';
import { getAbility } from '../../../abilities/AbilityRegistry';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../../abilities/abilityTimings';
import { getCastElapsed } from '../../time/actorClock';
import { isCrowdSpacingForcedMover } from '../shared/crowdSpacingParticipation';

/** The slice of the engine bracing reads (world time; units with a started local clock use their own). */
export interface CrowdBracingEngine {
    gameTime: number;
}

/** True while any active ability is inside an `AbilityPhase.Windup` interval and has not opted out. */
export function isInBracingWindup(unit: Unit, engine: CrowdBracingEngine): boolean {
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability || ability.crowdBraceDuringWindup === false) continue;
        const entries = resolveAbilityTimingEntries(ability, unit, engine);
        if (entries.length === 0) continue;
        const intervals = normalizeAbilityTimingsToIntervals(entries);
        const elapsed = getCastElapsed(unit, active, engine);
        if (getCoveringAbilityPhaseAtElapsed(elapsed, intervals) === AbilityPhase.Windup) return true;
    }
    return false;
}

/**
 * Whether the unit is braced this tick: tagged `Structure` or `CrowdSpacingAnchor`, a forced mover
 * (knockback / `controlled`), or in an ability windup (unless the ability sets `crowdBraceDuringWindup: false`).
 */
export function isCrowdBraced(unit: Unit, engine: CrowdBracingEngine): boolean {
    if (hasUnitTag(unit, UnitTag.Structure) || hasUnitTag(unit, UnitTag.CrowdSpacingAnchor)) return true;
    if (isCrowdSpacingForcedMover(unit)) return true;
    return isInBracingWindup(unit, engine);
}
