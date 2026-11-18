/**
 * `cadenceCast` component: "cast this ability N times per round", where N comes from a named rate rule that can read
 * anything about the unit and the battle (its phase, how many of its adds are left...). State only; the tick lives in
 * `cadenceCastHooks.ts`.
 *
 * Declare on a def with `componentSpec(CADENCE_CAST_COMPONENT, { abilityId: '1605', rateRule: 'someRuleId' })` and
 * register the rule with `registerCastRateRule(id, (unit, engine) => castsPerRound)` so defs stay plain data.
 *
 * Rules:
 *  - Progress fills by `rate * dt / ROUND_DURATION` each tick (world seconds, so Time Stop and world slow pause it);
 *    a cast fires when it reaches 1. A rate that changes mid-round changes the pace from that tick on.
 *  - Nothing fills while the unit is dead or held (`controlled`: stunned, burrowing). It does fill during the cast,
 *    so a long cast does not slow the cadence; a cast that is due waits for the previous one to end, and progress
 *    never banks more than one cast.
 *  - The ability does not need to be on the unit's ability list, so its AI never casts it by itself.
 */

import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export interface CadenceCastOptions {
    abilityId: string;
    /** Registered rate rule id (`registerCastRateRule`). */
    rateRule: string;
}

export interface CadenceCastState {
    /** 0-1 towards the next cast. */
    progress: number;
}

export const CADENCE_CAST_COMPONENT = defineUnitComponent<CadenceCastState, CadenceCastOptions>({
    id: 'cadenceCast',
    create: () => ({ progress: 0 }),
    toJSON: (s) => (s.progress > 0 ? { cadenceProgress: s.progress } : {}),
    fromJSON: (s, data) => {
        s.progress = typeof data.cadenceProgress === 'number' ? data.cadenceProgress : 0;
    },
});

export function peekCadenceCastState(unit: Unit): CadenceCastState | undefined {
    return findComponentState(unit, CADENCE_CAST_COMPONENT);
}

export function cadenceCastOptionsOf(unit: Unit): CadenceCastOptions | undefined {
    return getComponentOptions(unit, CADENCE_CAST_COMPONENT);
}
