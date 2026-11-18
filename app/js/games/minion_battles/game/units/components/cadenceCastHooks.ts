/**
 * `cadenceCast` component hooks (rules in `cadenceCast.ts`) and the rate-rule registry. `tick` runs once per
 * simulation tick in the nest phase: it fills each unit's progress at its current rate and casts when it is full.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import type { UnitComponentHooks } from './unitComponentHooks';
import { cadenceCastOptionsOf, peekCadenceCastState } from './cadenceCast';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { grantAbilityUses } from '../../../abilities/abilityUses';
import { executeUnitAbility } from '../unitAbilityLifecycle';
import { ROUND_DURATION } from '../../gameConstants';

/** Casts per round for this unit right now (0 or less: none). */
export type CastRateRule = (unit: Unit, engine: EngineContext) => number;

const RATE_RULES = new Map<string, CastRateRule>();

/** Register a rate rule. Returns an unregister function (for tests). Re-registering an id replaces it. */
export function registerCastRateRule(id: string, rule: CastRateRule): () => void {
    RATE_RULES.set(id, rule);
    return () => {
        if (RATE_RULES.get(id) === rule) RATE_RULES.delete(id);
    };
}

/** The unit's current casts per round, 0 when the rule is unknown. */
export function cadenceCastRate(unit: Unit, engine: EngineContext): number {
    const options = cadenceCastOptionsOf(unit);
    const rule = options ? RATE_RULES.get(options.rateRule) : undefined;
    return rule ? Math.max(0, rule(unit, engine)) : 0;
}

export const CADENCE_CAST_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        if (ctx.dt <= 0) return;
        for (const unit of [...ctx.units]) {
            const state = peekCadenceCastState(unit);
            const options = state ? cadenceCastOptionsOf(unit) : undefined;
            if (!state || !options || !unit.isAlive() || unit.controlled) continue;
            // Fills during the cast too, so the cast's own length does not slow the cadence.
            state.progress += (cadenceCastRate(unit, ctx.engine) * ctx.dt) / ROUND_DURATION;
            if (state.progress < 1) continue;
            const ability = getAbility(options.abilityId);
            if (!ability || unit.activeAbilities.some((a) => a.abilityId === options.abilityId)) {
                state.progress = 1; // due: wait for the previous cast, banking no more than this one
                continue;
            }
            state.progress -= 1; // keep the overshoot, so the cadence does not drift by a tick per cast
            grantAbilityUses(unit, ability.id, 1);
            executeUnitAbility(unit, ability, [], ctx.engine);
        }
    },
};
