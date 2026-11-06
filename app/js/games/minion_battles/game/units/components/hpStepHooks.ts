/**
 * `hpStep` component hooks (rules in `hpStepComponent.ts`). `tick` runs once per simulation tick in the nest
 * phase: it marks newly lost HP steps, then fires each queued cast whose unit is free to cast it.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import type { UnitComponentHooks } from './unitComponentHooks';
import { hpStepsLost, hpStepTriggersOf, peekHpStepState, type HpStepState, type HpStepTriggerDef } from './hpStepComponent';
import { getAbility } from '../../../abilities/AbilityRegistry';
import { grantAbilityUses } from '../../../abilities/abilityUses';
import { executeUnitAbility } from '../unitAbilityLifecycle';

/** Mark newly lost steps and queue casts. Exported for tests. */
export function updateHpSteps(unit: Unit, state: HpStepState, triggers: readonly HpStepTriggerDef[]): void {
    for (const t of triggers) {
        const steps = hpStepsLost(unit.hp, unit.maxHp, t.stepFraction);
        if (steps > (state.reached[t.id] ?? 0)) {
            state.reached[t.id] = steps;
            if (!state.pending.includes(t.id)) state.pending.push(t.id);
        }
    }
}

function tryFire(unit: Unit, state: HpStepState, triggers: readonly HpStepTriggerDef[], engine: EngineContext): void {
    for (const id of [...state.pending]) {
        const t = triggers.find((tr) => tr.id === id);
        const ability = t ? getAbility(t.abilityId) : undefined;
        if (!t || !ability) {
            state.pending = state.pending.filter((p) => p !== id);
            continue;
        }
        if (t.deferWhileCasting?.some((a) => unit.activeAbilities.some((act) => act.abilityId === a))) continue;
        state.pending = state.pending.filter((p) => p !== id);
        grantAbilityUses(unit, ability.id, 1);
        executeUnitAbility(unit, ability, [], engine);
    }
}

export const HP_STEP_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of [...ctx.units]) {
            const state = peekHpStepState(unit);
            if (!state || !unit.isAlive()) continue;
            const triggers = hpStepTriggersOf(unit);
            updateHpSteps(unit, state, triggers);
            if (state.pending.length > 0) tryFire(unit, state, triggers, ctx.engine);
        }
    },
};
