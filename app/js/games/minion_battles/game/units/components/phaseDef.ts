/**
 * Unit phases: data for "this unit changes behaviour as the fight progresses" (boss phases, elite enrages).
 *
 * A def lists `phases` on its `UnitDefEntry`. Phases only ever advance (see `phaseRuntime.ts`): each phase is
 * entered once, in list order, when its `enterWhen` condition holds. Entering applies tags, ability changes,
 * modifiers and an AI switch, starts an optional transition (Time Stop / story pause / invulnerability window /
 * banner), runs `onEnter` world effects and emits `unit_phase_entered`.
 *
 * Phases work on ANY unit (not only `UnitTag.Boss`). A one-phase enrage is `enragePreset(...)`.
 *
 * This module is types and pure helpers only (no engine imports), so unit defs can import it freely.
 */

import type { TeamId } from '../../teams';
import { UnitTag } from '../unitTag';
import type { WorldEffect } from '../../../worldModifiers/WorldEffect';

/** A condition on one unit and the battle. Evaluated after damage and once per tick. */
export type PhaseCondition =
    /** The unit's HP is at or below `threshold` (fraction of max HP, 0-1). */
    | { kind: 'health_below_percent'; threshold: number }
    /**
     * World seconds elapsed (so Time Stop does not count). `from: 'battleStart'` (default) is absolute game time;
     * `'previousPhase'` counts from when the previous phase was entered (battle start for the first phase).
     */
    | { kind: 'elapsed_seconds'; seconds: number; from?: 'battleStart' | 'previousPhase' }
    /**
     * Fewer than `count` living units match. Typical use: "all adds dead" (`count: 1, characterId: 'dark_wolf'`).
     * The phased unit itself is never counted. Filters AND together; none = every other living unit.
     */
    | { kind: 'units_alive_below'; count: number; characterId?: string; teamId?: TeamId }
    /** A world-modifier counter (see `worldModifiers/`) has reached `count`. */
    | { kind: 'counter_at_least'; modifierId: string; counterId: string; count: number }
    | { kind: 'all'; conditions: PhaseCondition[] }
    | { kind: 'any'; conditions: PhaseCondition[] };

/**
 * How entering a phase is presented. All durations are TICK time (`engine.tickTime`), the one clock that keeps
 * advancing through a Time Stop, so a freeze can never outlast its own invulnerability window.
 *  - `none`: no engine pause (the duration still bounds the banner and invulnerability).
 *  - `timeStop`: `engine.startTimeStop` for `durationSeconds` (world pace 0, nothing exempt).
 *  - `storyPause`: `engine.startStoryPause` for `durationSeconds` (whole sim halts; players gain can't-die).
 */
export interface PhaseTransitionDef {
    kind: 'none' | 'timeStop' | 'storyPause';
    /** Length of the transition. Used by `timeStop` and `storyPause`; bounds the banner for `none`. */
    durationSeconds?: number;
    /** Unit takes no damage and cannot be targeted for this long after entering (`UnitTag.Invincible`). */
    invulnerableSeconds?: number;
    /** Text for the boss HUD banner while the transition lasts. */
    banner?: string;
}

/** Permanent stat changes applied when a phase is entered. Extend with new fields rather than special cases. */
export interface PhaseModifiers {
    /** Local-clock rate (a `TimeDilationBuff`, no focal): 1.25 = moves and casts 25% faster. */
    tempo?: number;
    /** Multiplies the unit's outgoing damage (`combatSettings.damageModifier.multiplier`). */
    damageMultiplier?: number;
}

export interface UnitPhaseDef {
    /** Stable id, unique within the unit def. */
    id: string;
    /** Shown on the boss HUD while this is the current phase. */
    label?: string;
    enterWhen: PhaseCondition;
    /** Tag changes; every `requiredTags` / `forbiddenTags` ability gate keeps working off these. */
    tags?: { add?: UnitTag[]; remove?: UnitTag[] };
    /** Explicit ability list changes, for finer control than tags. */
    abilities?: { add?: string[]; remove?: string[] };
    /** Swap the AI tree, and/or jump to a node of the (new) tree. */
    ai?: { treeId?: string; node?: string };
    modifiers?: PhaseModifiers;
    transition?: PhaseTransitionDef;
    /**
     * World effects run when the phase is entered (`spawnUnits`, `spawnLightSource`, `incrementCounter` with a
     * `modifierId`, add/remove modifier...). `position: 'victim'` means the phased unit.
     */
    onEnter?: WorldEffect[];
}

/**
 * A one-phase enrage: at or below `threshold` of max HP the unit gains `tag` (default `UnitTag.Enraged`).
 * Replaces the old `enrageDef`. Spread extra fields over the result for a richer enrage.
 */
export function enragePreset(threshold: number, tag: UnitTag = UnitTag.Enraged, id = 'enraged'): UnitPhaseDef {
    return {
        id,
        label: 'Enraged',
        enterWhen: { kind: 'health_below_percent', threshold },
        tags: { add: [tag] },
    };
}

/** Every `health_below_percent` threshold in a phase list (descending), for HP-bar tick marks. */
export function getPhaseHpThresholds(phases: readonly UnitPhaseDef[] | undefined): number[] {
    const out = new Set<number>();
    const visit = (c: PhaseCondition): void => {
        if (c.kind === 'health_below_percent') out.add(c.threshold);
        else if (c.kind === 'all' || c.kind === 'any') c.conditions.forEach(visit);
    };
    for (const p of phases ?? []) visit(p.enterWhen);
    return [...out].sort((a, b) => b - a);
}
