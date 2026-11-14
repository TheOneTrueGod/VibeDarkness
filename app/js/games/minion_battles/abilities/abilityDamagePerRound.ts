/**
 * Rough damage-per-round estimates for planning views (Mission Overview, balance tables).
 *
 * An ability's estimate is its base hit (`AbilityStatic.getDamage`) times how many full casts fit in a
 * round, where one cast lasts its whole timing cycle including cooldown (`getTotalAbilityDuration`).
 * It is an upper bound: it ignores walking, aiming, AI choices and extra hits of multi-hit abilities.
 * Abilities that do not report damage give `null` (unknown), not 0.
 */
import { ROUND_DURATION } from '../game/gameConstants';
import { getStackDamageMultiplier } from '../game/units/stackRules';
import { getAbility } from './AbilityRegistry';
import { getTotalAbilityDuration } from './abilityTimings';

/** Shortest cast cycle used, so a zero-length ability cannot report infinite damage. */
const MIN_CAST_CYCLE_SECONDS = 0.5;

/** Damage one caster deals per round with this ability, or `null` when the ability does not report damage. */
export function estimateAbilityDamagePerRound(abilityId: string): number | null {
    const ability = getAbility(abilityId);
    if (!ability || typeof ability.getDamage !== 'function') return null;
    const damage = ability.getDamage();
    if (!(damage > 0)) return null;
    let cycle = MIN_CAST_CYCLE_SECONDS;
    try {
        cycle = Math.max(MIN_CAST_CYCLE_SECONDS, getTotalAbilityDuration(ability));
    } catch {
        // No timings: fall back to the minimum cycle.
    }
    return damage * (ROUND_DURATION / cycle);
}

/**
 * A unit's damage per round: its best ability's estimate (a unit casts one ability at a time) scaled by
 * stack size. `null` when none of its abilities report damage.
 */
export function estimateUnitDamagePerRound(abilityIds: readonly string[], stackSize = 1): number | null {
    let best: number | null = null;
    for (const id of abilityIds) {
        const dpr = estimateAbilityDamagePerRound(id);
        if (dpr != null && (best == null || dpr > best)) best = dpr;
    }
    return best == null ? null : best * getStackDamageMultiplier(stackSize);
}
