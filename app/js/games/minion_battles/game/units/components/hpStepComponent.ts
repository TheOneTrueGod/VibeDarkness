/**
 * `hpStep` component: "every time this unit loses N% of its max HP, cast an ability". State only (hooks in
 * `hpStepHooks.ts`).
 *
 * Declare on a def with
 * `components: [componentSpec(HP_STEP_COMPONENT, { triggers: [{ id: 'swap', stepFraction: 0.1, abilityId: '1406' }] })]`.
 *
 * Rules:
 *  - Steps are counted from max HP: with `stepFraction: 0.1` the trigger fires at 90%, 80%, ... 10%.
 *  - One-way: `reached` only grows, so healing back above a step never re-arms it.
 *  - A hit that crosses several steps queues ONE cast (the steps are all marked reached), or one per step with
 *    `castPerStep`, fired on successive ticks.
 *  - A queued cast waits while the unit casts any of `deferWhileCasting` (e.g. a channel that the cast would
 *    break), then fires on the first tick it can.
 */

import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export interface HpStepTriggerDef {
    /** Stable id, unique within the def (state is keyed by it). */
    id: string;
    /** Fraction of max HP per step (0.1 = every 10% lost). */
    stepFraction: number;
    /** Ability the unit casts (targetless; granted a use if it has none). */
    abilityId: string;
    /** Hold the cast while the unit has any of these abilities active. */
    deferWhileCasting?: readonly string[];
    /** A hit that crosses several steps queues one cast per step (default: one cast in total). */
    castPerStep?: boolean;
    /** Stop after this many steps (0.1 steps with `maxSteps: 5` fire at 90% .. 50%). Default: every step down to 0. */
    maxSteps?: number;
    /** Draw each of this trigger's steps as a tick mark on the boss HP bar (see `hpStepBarMarks`). */
    showOnHpBar?: boolean;
}

export interface HpStepComponentOptions {
    triggers: readonly HpStepTriggerDef[];
}

export interface HpStepState {
    /** Steps reached so far, per trigger id. */
    reached: Record<string, number>;
    /** Trigger ids with a cast waiting to fire. */
    pending: string[];
}

/** Steps of `stepFraction` lost from max HP (0 at full HP). */
export function hpStepsLost(hp: number, maxHp: number, stepFraction: number): number {
    if (maxHp <= 0 || stepFraction <= 0) return 0;
    return Math.max(0, Math.floor((maxHp - hp) / (maxHp * stepFraction) + 1e-9));
}

/** Steps of `trigger` lost at this HP, capped by `maxSteps`. */
export function hpStepsReached(hp: number, maxHp: number, trigger: HpStepTriggerDef): number {
    const steps = hpStepsLost(hp, maxHp, trigger.stepFraction);
    return trigger.maxSteps === undefined ? steps : Math.min(steps, trigger.maxSteps);
}

/** HP fractions (descending, 0-1) at which `showOnHpBar` triggers fire, for HP-bar tick marks. */
export function hpStepBarMarks(triggers: readonly HpStepTriggerDef[] | undefined): number[] {
    const out = new Set<number>();
    for (const t of triggers ?? []) {
        if (!t.showOnHpBar || t.stepFraction <= 0) continue;
        const last = t.maxSteps ?? Math.floor(1 / t.stepFraction + 1e-9) - 1;
        for (let k = 1; k <= last; k++) out.add(Math.round((1 - k * t.stepFraction) * 1e4) / 1e4);
    }
    return [...out].filter((f) => f > 0).sort((a, b) => b - a);
}

export const HP_STEP_COMPONENT = defineUnitComponent<HpStepState, HpStepComponentOptions>({
    id: 'hpStep',
    create: () => ({ reached: {}, pending: [] }),
    toJSON: (state) => ({
        ...(Object.keys(state.reached).length > 0 ? { hpStepReached: { ...state.reached } } : {}),
        ...(state.pending.length > 0 ? { hpStepPending: [...state.pending] } : {}),
    }),
    fromJSON: (state, data) => {
        const reached = data.hpStepReached;
        state.reached = {};
        if (reached && typeof reached === 'object') {
            for (const [k, v] of Object.entries(reached as Record<string, unknown>)) {
                if (typeof v === 'number') state.reached[k] = v;
            }
        }
        state.pending = Array.isArray(data.hpStepPending)
            ? (data.hpStepPending as unknown[]).filter((v): v is string => typeof v === 'string')
            : [];
    },
});

export function peekHpStepState(unit: Unit): HpStepState | undefined {
    return findComponentState(unit, HP_STEP_COMPONENT);
}

export function hpStepTriggersOf(unit: Unit): readonly HpStepTriggerDef[] {
    return getComponentOptions(unit, HP_STEP_COMPONENT)?.triggers ?? [];
}
