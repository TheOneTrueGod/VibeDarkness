/**
 * Cast priority: which cast may replace which on a unit.
 *
 * Each cast records the priority it started with (`ActiveAbility.castPriority`, stamped from
 * `BattleOrder.castPriority`). A unit's **effective** priority is derived each tick from serialized
 * state and never stored:
 * - no casts: `Idle`;
 * - a cast in its cooldown phase: `min(stamped, Minor)` (a winding-down cast is free);
 * - a unit held by another unit's cast (`isUnitHeldByCast`): `Major`;
 * - otherwise the highest effective priority among its casts (unstamped casts count as `Minor`).
 *
 * An order carrying a `castPriority` starts only when that priority is strictly greater than the unit's
 * effective priority (`canPreempt`). A unit is **busy** at `Major` or above (`isUnitBusy`).
 *
 * Callers use the named levels, never raw numbers. Gaps leave room for later levels (30+ reserved).
 */
import type { AbilityStatic } from '../../abilities/Ability';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { getCastElapsed } from '../time/actorClock';
import type { ActiveAbility } from '../types';
import type { Unit } from './Unit';
import { isUnitHeldByCast } from './castHold';

export const CAST_PRIORITY = {
    /** No cast running. */
    Idle: 0,
    /** AI casts (e.g. bite), reactions (e.g. Spirit Strike), walking. Also the level of unstamped casts. */
    Minor: 10,
    /** Abilities a player directly commanded. A unit at this level or above is busy. */
    Major: 20,
} as const;

export type CastPriority = (typeof CAST_PRIORITY)[keyof typeof CAST_PRIORITY];

/** What the priority lookup needs from the engine: the world clock for cast elapsed. */
export interface CastPriorityEngine {
    gameTime: number;
}

type AbilityLookup = (abilityId: string) => AbilityStatic | undefined;

let abilityLookup: AbilityLookup | null = null;

/**
 * Wired from `AbilityRegistry` once abilities are registered. A static import of the registry here would
 * close an import cycle (previewHelpers → abilitySourceUnits → castPriority → registry → card defs →
 * previewHelpers). Until it is wired, every cast counts at its stamp.
 */
export function setCastPriorityAbilityLookup(lookup: AbilityLookup): void {
    abilityLookup = lookup;
}

function isCooldownPhase(phase: AbilityPhase | null): boolean {
    return phase === AbilityPhase.Cooldown || phase === AbilityPhase.CoopCooldown;
}

/** Effective priority of one running cast: its stamp (default `Minor`), capped at `Minor` in cooldown. */
export function getCastEffectivePriority(unit: Unit, active: ActiveAbility, engine: CastPriorityEngine): number {
    const stamped = active.castPriority ?? CAST_PRIORITY.Minor;
    const ability = abilityLookup?.(active.abilityId);
    if (!ability) return stamped;
    const elapsed = Math.max(0, getCastElapsed(unit, active, engine));
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
    const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);
    return isCooldownPhase(phase) ? Math.min(stamped, CAST_PRIORITY.Minor) : stamped;
}

/**
 * Effective priority of a unit: `Major` when held by a cast, else the max over its casts (`Idle` if none).
 * `excludeAbilityId` leaves that cast out (a follow-up order's parent, `BattleOrder.followUpOf`); being
 * held by another unit's cast still counts.
 */
export function getUnitEffectivePriority(
    unit: Unit,
    units: readonly Unit[],
    engine: CastPriorityEngine,
    excludeAbilityId?: string,
): number {
    let best: number = CAST_PRIORITY.Idle;
    if (isUnitHeldByCast(unit, units)) best = CAST_PRIORITY.Major;
    for (const active of unit.activeAbilities) {
        if (excludeAbilityId !== undefined && active.abilityId === excludeAbilityId) continue;
        best = Math.max(best, getCastEffectivePriority(unit, active, engine));
    }
    return best;
}

/** Busy: effective priority at `Major` or above. Free is anything lower. */
export function isUnitBusy(unit: Unit, units: readonly Unit[], engine: CastPriorityEngine): boolean {
    return getUnitEffectivePriority(unit, units, engine) >= CAST_PRIORITY.Major;
}

/**
 * Whether an order at `priority` may start on the unit: strictly greater than its effective priority.
 * `excludeAbilityId` is the order's `followUpOf` parent, left out of the comparison.
 */
export function canPreempt(
    unit: Unit,
    priority: number,
    units: readonly Unit[],
    engine: CastPriorityEngine,
    excludeAbilityId?: string,
): boolean {
    return priority > getUnitEffectivePriority(unit, units, engine, excludeAbilityId);
}

/**
 * Stamped priority of the unit's running `abilityId` cast (`ActiveAbility.castPriority`), or undefined when
 * it isn't running or is unstamped. A follow-up inside a chain passes this on so it keeps its parent's level.
 */
export function getRunningCastPriority(unit: Unit, abilityId: string): number | undefined {
    return unit.activeAbilities.find((a) => a.abilityId === abilityId)?.castPriority;
}
