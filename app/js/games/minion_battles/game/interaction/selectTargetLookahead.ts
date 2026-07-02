/**
 * Pre-tick lookahead for interactive SelectTargetDef intervals.
 *
 * Called from GameEngine.fixedUpdate before gameTime advances so the engine can
 * pause and collect input without missing entry-tick cast behaviour semantics.
 */

import { getAbility } from '../../abilities/AbilityRegistry';
import {
    enteredTimingIds,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { isSelectTargetDef } from '../../abilities/timingTargetDef';
import type { EngineContext } from '../EngineContext';
import type { ActiveAbility } from '../types';

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
        if (!interval.targetDef || !isSelectTargetDef(interval.targetDef)) continue;

        const label = interval.targetDef.label;
        if (active.targetsByLabel[label] !== undefined) continue;
        if (active.setupFiredBehaviourKeys?.has(`${interval.id}_0`)) continue;

        return { label, unitId, abilityId: active.abilityId };
    }

    return null;
}

/**
 * Returns the first unresolved SelectTargetDef interval that would enter on the
 * next fixed tick, or null when no interactive preview cast needs input.
 */
export function findImpendingSelectTargetNeed(
    engine: EngineContext,
    dt: number,
): ImpendingSelectTargetNeed | null {
    for (const unit of engine.units) {
        for (const active of unit.activeAbilities) {
            const prevElapsed = engine.gameTime - active.startTime;
            const nextElapsed = prevElapsed + dt;
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
