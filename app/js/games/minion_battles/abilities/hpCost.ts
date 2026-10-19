/**
 * Shared HP-cost payment for abilities that spend the caster's own health (`AbilityStatic.hpCost`).
 * Affordability is gated elsewhere (`unitAbilityQueries` / `abilityDisabledReason`); this is the
 * single place that actually deducts the cost, honouring `hpCostGate`.
 */

import type { AbilityStatic } from './Ability';
import { CastBehaviours } from './CastBehaviours';
import type { InstantBehaviour } from './CastBehaviours/InstantBehaviour';
import type { Unit } from '../game/units/Unit';

export type HpCostGate = NonNullable<AbilityStatic['hpCostGate']>;

/**
 * Deducts `cost` HP from the caster.
 * - `'floorAtOne'` clamps the deduction so it never drops the caster below 1 HP.
 * - `'requireSurplus'` / `'none'` deduct the full amount (`requireSurplus` is already gated to hp > cost).
 */
export function payHpCost(caster: Unit, cost: number, gate: HpCostGate = 'requireSurplus'): void {
    if (cost <= 0) return;
    const deduction = gate === 'floorAtOne'
        ? Math.max(0, Math.min(cost, caster.hp - 1))
        : cost;
    caster.hp -= deduction;
}

/**
 * CastBehaviour that pays `cost` HP when its timing window opens. Place it on the release
 * interval (the one marked `doNotRefund`) so a cast cancelled during windup costs nothing.
 */
export function payHpCostBehaviour(cost: number, gate: HpCostGate = 'requireSurplus'): InstantBehaviour {
    return CastBehaviours.Instant((ctx) => payHpCost(ctx.caster, cost, gate));
}
