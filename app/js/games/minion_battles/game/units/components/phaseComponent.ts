import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions, getComponentState } from './unitComponent';
import type { UnitPhaseDef } from './phaseDef';

/** A transition in progress (tick-time deadlines; see `PhaseTransitionDef`). */
export interface ActivePhaseTransition {
    phaseId: string;
    /** `engine.tickTime` when the whole transition (banner + invulnerability) ends. */
    endsAtTickTime: number;
    /** `engine.tickTime` when the invulnerability window ends; null when none. */
    invulnerableUntilTickTime: number | null;
    /** True when this transition added `UnitTag.Invincible` (so only it removes the tag). */
    addedInvincibleTag: boolean;
    /** Id of the Time Stop this transition started (informational). */
    timeStopId: string | null;
    banner: string | null;
}

export interface UnitPhaseState {
    /** Number of phases entered so far (the next phase to check is `phases[index]`). One-way: never decreases. */
    index: number;
    /** `engine.gameTime` (world time) when the latest phase was entered; null = none yet / unknown (legacy). */
    enteredAtGameTime: number | null;
    /**
     * Lowest HP fraction seen right after a damage event (1 = none). HP conditions are evaluated live only after
     * damage (as the old enrage was); the per-tick pass reads this latched value, so setting `hp` directly or a
     * max-HP change never triggers a phase by itself, yet `all[health, elapsed]` still works.
     */
    hpFractionAtDamage: number;
    transition: ActivePhaseTransition | null;
}

export function createPhaseState(): UnitPhaseState {
    return { index: 0, enteredAtGameTime: null, hpFractionAtDamage: 1, transition: null };
}

/** Declared automatically for any def with `phases` (see `getUnitComponentSpecs`). Options carry the def's phase list. */
export interface PhaseComponentOptions {
    phases: readonly UnitPhaseDef[];
}

/**
 * Keys written at the unit's top level, omitted at defaults so a unit with no phase progress serializes to `{}`
 * (old checkpoints have none of these, which reads back as "no phase entered"; see `phaseRuntime.ts` for how a
 * unit that is already enraged in an old checkpoint is recognised from its tags).
 */
function phaseStateToJSON(state: UnitPhaseState): Record<string, unknown> {
    return {
        ...(state.index > 0 ? { phaseIndex: state.index } : {}),
        ...(state.enteredAtGameTime != null ? { phaseEnteredAtGameTime: state.enteredAtGameTime } : {}),
        ...(state.hpFractionAtDamage < 1 ? { phaseHpFractionAtDamage: state.hpFractionAtDamage } : {}),
        ...(state.transition != null ? { phaseTransition: { ...state.transition } } : {}),
    };
}

function applyPhaseStateFromJSON(state: UnitPhaseState, data: Record<string, unknown>): void {
    state.index = typeof data.phaseIndex === 'number' ? data.phaseIndex : 0;
    state.enteredAtGameTime = typeof data.phaseEnteredAtGameTime === 'number' ? data.phaseEnteredAtGameTime : null;
    state.hpFractionAtDamage = typeof data.phaseHpFractionAtDamage === 'number' ? data.phaseHpFractionAtDamage : 1;
    const t = data.phaseTransition as Partial<ActivePhaseTransition> | undefined;
    state.transition =
        t && typeof t === 'object' && typeof t.phaseId === 'string' && typeof t.endsAtTickTime === 'number'
            ? {
                  phaseId: t.phaseId,
                  endsAtTickTime: t.endsAtTickTime,
                  invulnerableUntilTickTime:
                      typeof t.invulnerableUntilTickTime === 'number' ? t.invulnerableUntilTickTime : null,
                  addedInvincibleTag: t.addedInvincibleTag === true,
                  timeStopId: typeof t.timeStopId === 'string' ? t.timeStopId : null,
                  banner: typeof t.banner === 'string' ? t.banner : null,
              }
            : null;
}

export const PHASE_COMPONENT = defineUnitComponent<UnitPhaseState, PhaseComponentOptions>({
    id: 'phase',
    create: () => createPhaseState(),
    toJSON: phaseStateToJSON,
    fromJSON: applyPhaseStateFromJSON,
});

/** Phase state, attaching an empty slice when absent. */
export function phaseStateOf(unit: Unit): UnitPhaseState {
    return getComponentState(unit, PHASE_COMPONENT);
}

/** Phase state if the unit carries the component (use for scans and UI so nothing is attached). */
export function peekPhaseState(unit: Unit): UnitPhaseState | undefined {
    return findComponentState(unit, PHASE_COMPONENT);
}

/** The phase list this unit was declared with (empty when none). */
export function phasesOf(unit: Unit): readonly UnitPhaseDef[] {
    return getComponentOptions(unit, PHASE_COMPONENT)?.phases ?? [];
}
