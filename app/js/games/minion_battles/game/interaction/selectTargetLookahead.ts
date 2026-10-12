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
    type AbilityTimingInterval,
} from '../../abilities/abilityTimings';
import { isInteractiveTargetDef, isSelectTargetDef } from '../../abilities/timingTargetDef';
import { nullHitbox } from '../../hitboxes';
import type { EngineContext } from '../EngineContext';
import type { ActiveAbility } from '../types';
import type { Unit } from '../units/Unit';

export interface ImpendingSelectTargetNeed {
    label: string;
    unitId: string;
    abilityId: string;
}

export interface SelectGateSplit {
    /** Interval id of the interactive select whose entry is gated. */
    intervalId: string;
    /** Elapsed time (the select's start) the cast is processed up to on this tick. */
    elapsed: number;
}

/**
 * Select gate: decides whether this tick must be cut short at an interactive select's start.
 *
 * When the tick window `(prevElapsed, nextElapsed]` contains the start `s` of an interactive
 * select interval (start > 0), the cast is processed only up to `s` on this tick. Everything
 * scheduled at or before `s` (intervals ending at `s`, their exit hooks, Instant behaviours)
 * therefore lands before the player is asked. The select itself enters on the following tick,
 * whose window starts at `s` (`computeTickElapsed` `resumeFrom`), so it is not split again.
 *
 * Decided purely from the timing structure. It never looks at whether a label is resolved, so
 * preview and committed runs split on the same tick. Ties go to the earlier interval in list order.
 */
export function findSelectGateSplit(
    intervals: AbilityTimingInterval[],
    prevElapsed: number,
    nextElapsed: number,
): SelectGateSplit | null {
    let best: AbilityTimingInterval | null = null;
    for (const interval of intervals) {
        if (!interval.targetDef || !isInteractiveTargetDef(interval.targetDef)) continue;
        if (!(interval.start > 0 && interval.start > prevElapsed && interval.start <= nextElapsed)) continue;
        if (best === null || interval.start < best.start) best = interval;
    }
    return best ? { intervalId: best.id, elapsed: best.start } : null;
}

/**
 * Interval ids whose entry a select gate defers: the gated select, plus any interval declared after
 * it that starts at the same elapsed time. They are held back on the gate tick and enter on the
 * resumed tick. They enter there even when they have already ended by the end of that tick's window
 * (for example a one-tick select), so they enter and exit on the same tick like a one-shot entry.
 */
export function selectGateDeferredIds(intervals: AbilityTimingInterval[], gatedIntervalId: string): string[] {
    const gatedIndex = intervals.findIndex((i) => i.id === gatedIntervalId);
    if (gatedIndex < 0) return [];
    const start = intervals[gatedIndex]!.start;
    const ids: string[] = [];
    for (let k = gatedIndex; k < intervals.length; k++) {
        const later = intervals[k]!;
        if (later.start === start) ids.push(later.id);
    }
    return ids;
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
    // The tick after a gate tick force-enters the gated intervals (see selectGateDeferredIds), so the
    // lookahead must treat them as entering too, even when a short select is no longer active at nextElapsed.
    if (active.pendingSelectGate !== undefined) {
        for (const id of selectGateDeferredIds(intervals, active.pendingSelectGate)) entered.add(id);
    }

    for (const interval of intervals) {
        if (!entered.has(interval.id)) continue;
        if (!interval.targetDef || !isInteractiveTargetDef(interval.targetDef)) continue;
        // A select with start > 0 enters only on the tick after its gate split (see
        // findSelectGateSplit). Entering on any other tick means the gate tick is still running,
        // so do not pause yet. Selects at start 0 are not gated and keep the pre-tick pause.
        if (interval.start > 0 && active.pendingSelectGate !== interval.id) continue;

        const label = interval.targetDef.label;
        // A label the order is known to lack never pauses the lookahead: the real timeline handles it
        // (missing-pick pause, or fizzle on entry). Reads only the serialized `missingSelectLabels`,
        // never `targetsByLabel`, which does not survive a snapshot.
        if (active.missingSelectLabels?.includes(label)) continue;
        if (active.targetsByLabel[label] !== undefined) continue;
        if (active.setupFiredBehaviourKeys?.has(`${interval.id}_0`)) continue;

        return { label, unitId, abilityId: active.abilityId };
    }

    return null;
}

/**
 * Returns the label of the first interactive target when preview must defer
 * queueing the cast order until the player picks (no simulation ticks before input).
 *
 * Defer when:
 * - the first interactive interval starts at elapsed 0 (lookahead cannot pause before cast apply), or
 * - the ability has windup `lunge` (beginActiveCast needs a target before windup movement), or
 * - the first select is a pixel-aim `nullHitbox` pick (Throw Rock, Dodge, Claw). Lookahead
 *   pause at the later Active frame playaheads through windup with no line preview and
 *   swallows canvas clicks until React observes `waitingForTargetInput`.
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
        if (isSelectTargetDef(interval.targetDef) && interval.targetDef.hitbox === nullHitbox) {
            return interval.targetDef.label;
        }
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
            const { prevElapsed, nextElapsed } = computeTickElapsed(
                engine.gameTime + dt,
                dt,
                active.startTime,
                active.processedElapsed,
            );
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
