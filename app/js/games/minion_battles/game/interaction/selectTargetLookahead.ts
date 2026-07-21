/**
 * Pre-tick lookahead for interactive SelectTargetDef intervals.
 *
 * Called from GameEngine.fixedUpdate before gameTime advances so the engine can
 * pause and collect input without missing entry-tick cast behaviour semantics.
 */

import type { AbilityStatic } from '../../abilities/Ability';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    computeTickElapsed,
    enteredTimingIds,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { isInteractiveTargetDef } from '../../abilities/timingTargetDef';
import type { EngineContext } from '../EngineContext';
import type { ActiveAbility } from '../types';
import type { Unit } from '../units/Unit';

export interface ImpendingSelectTargetNeed {
    label: string;
    unitId: string;
    abilityId: string;
}

function findImpendingNeedForCast(
    unitId: string,
    active: ActiveAbility,
    prevElapsed: number,
    nextElapsed: number,
    engine: EngineContext,
): ImpendingSelectTargetNeed | null {
    if (active.targetsByLabel === undefined) return null;

    const ability = getAbility(active.abilityId);
    if (!ability) return null;

    const unit = engine.getUnit(unitId);
    if (!unit) return null;

    const intervals = normalizeAbilityTimingsToIntervals(
        resolveAbilityTimingEntries(ability, unit, engine),
    );
    const entered = enteredTimingIds(prevElapsed, nextElapsed, intervals);

    for (const interval of intervals) {
        if (!entered.has(interval.id)) continue;
        if (!interval.targetDef || !isInteractiveTargetDef(interval.targetDef)) continue;

        const label = interval.targetDef.label;
        if (active.targetsByLabel[label] !== undefined) continue;
        if (active.setupFiredBehaviourKeys?.has(`${interval.id}_0`)) continue;

        return { label, unitId, abilityId: active.abilityId };
    }

    return null;
}

/**
 * Returns the first unresolved interactive target interval (`select` / `confirmRadius`)
 * that would enter on the next fixed tick, or null when no preview cast needs input.
 */
/**
 * Returns the label of the first interactive target when preview must defer
 * queueing the cast order until the player picks (no simulation ticks before input).
 *
 * Defer when:
 * - the first interactive interval starts at elapsed 0 (lookahead cannot pause before cast apply), or
 * - the ability has windup `lunge` (beginActiveCast needs a target before windup movement).
 *
 * Otherwise returns null and pre-tick lookahead handles the first pause.
 */
export function findPreviewDeferredSelectLabel(
    ability: AbilityStatic,
    unit: Unit,
    engine: EngineContext,
): string | null {
    const intervals = normalizeAbilityTimingsToIntervals(
        resolveAbilityTimingEntries(ability, unit, engine),
    );
    for (const interval of intervals) {
        if (!interval.targetDef || !isInteractiveTargetDef(interval.targetDef)) continue;
        if (interval.start === 0) return interval.targetDef.label;
        if (ability.lunge != null) return interval.targetDef.label;
        return null;
    }
    return null;
}

/** @deprecated Use {@link findPreviewDeferredSelectLabel}. */
export function findFirstSelectTargetLabelAtElapsedZero(
    ability: AbilityStatic,
    unit: Unit,
    engine: EngineContext,
): string | null {
    const intervals = normalizeAbilityTimingsToIntervals(
        resolveAbilityTimingEntries(ability, unit, engine),
    );
    for (const interval of intervals) {
        if (!interval.targetDef || !isInteractiveTargetDef(interval.targetDef)) continue;
        return interval.start === 0 ? interval.targetDef.label : null;
    }
    return null;
}

export function findImpendingSelectTargetNeed(
    engine: EngineContext,
    dt: number,
): ImpendingSelectTargetNeed | null {
    for (const unit of engine.units) {
        for (const active of unit.activeAbilities) {
            // See computeTickElapsed's doc comment for why this must not be reimplemented inline.
            const { prevElapsed, nextElapsed } = computeTickElapsed(engine.gameTime + dt, dt, active.startTime);
            const need = findImpendingNeedForCast(
                unit.id,
                active,
                prevElapsed,
                nextElapsed,
                engine,
            );
            if (need) return need;
        }
    }
    return null;
}
