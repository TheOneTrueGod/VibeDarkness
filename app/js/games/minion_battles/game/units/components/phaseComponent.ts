import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions, getComponentState } from './unitComponent';
import { BURROW_STAGES, type BurrowStage, type UnitPhaseDef } from './phaseDef';

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

/** A burrow transition in progress (tick-time deadlines; see `BurrowTransitionDef`). The stage list lives in the def. */
export interface ActiveBurrow {
    /** What started it: the phase id, or the `burrowHop` component id for a hop. */
    phaseId: string;
    stage: BurrowStage;
    /** `engine.tickTime` the current stage began / ends. */
    stageStartsAtTickTime: number;
    stageEndsAtTickTime: number;
    fromX: number;
    fromY: number;
    /** The chosen sprout point (chosen once at the start). */
    toX: number;
    toY: number;
    /** Radius of the rise eruption (from `BurrowEruptionDef`), when the def has one; the renderer draws its telegraph. */
    eruptionRadiusPx?: number;
    /** Set when the eruption's circle shows from the travel stage on (`BurrowEruptionDef.telegraphFrom`). */
    eruptionTelegraphFromTravel?: boolean;
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
    /** Set while a `burrow` transition runs. */
    burrow: ActiveBurrow | null;
}

export function createPhaseState(): UnitPhaseState {
    return { index: 0, enteredAtGameTime: null, hpFractionAtDamage: 1, transition: null, burrow: null };
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
        ...(state.burrow != null ? { phaseBurrow: { ...state.burrow } } : {}),
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
    state.burrow = parseActiveBurrow(data.phaseBurrow);
}

/** An `ActiveBurrow` read back from JSON, or null when the data is missing or malformed. */
export function parseActiveBurrow(raw: unknown): ActiveBurrow | null {
    const b = raw as Partial<ActiveBurrow> | undefined;
    return b &&
        typeof b === 'object' &&
        typeof b.phaseId === 'string' &&
        (BURROW_STAGES as readonly unknown[]).includes(b.stage) &&
        typeof b.stageStartsAtTickTime === 'number' &&
        typeof b.stageEndsAtTickTime === 'number' &&
        typeof b.fromX === 'number' &&
        typeof b.fromY === 'number' &&
        typeof b.toX === 'number' &&
        typeof b.toY === 'number'
            ? {
                  phaseId: b.phaseId,
                  stage: b.stage as BurrowStage,
                  stageStartsAtTickTime: b.stageStartsAtTickTime,
                  stageEndsAtTickTime: b.stageEndsAtTickTime,
                  fromX: b.fromX,
                  fromY: b.fromY,
                  toX: b.toX,
                  toY: b.toY,
                  ...(typeof b.eruptionRadiusPx === 'number' ? { eruptionRadiusPx: b.eruptionRadiusPx } : {}),
                  ...(b.eruptionTelegraphFromTravel === true ? { eruptionTelegraphFromTravel: true } : {}),
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
