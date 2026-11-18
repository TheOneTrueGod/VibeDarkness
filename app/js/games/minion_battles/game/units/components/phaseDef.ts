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
    kind: 'none' | 'timeStop' | 'storyPause' | 'burrow';
    /** Length of the transition. Used by `timeStop` and `storyPause`; bounds the banner for `none`. */
    durationSeconds?: number;
    /** Unit takes no damage and cannot be targeted for this long after entering (`UnitTag.Invincible`). */
    invulnerableSeconds?: number;
    /** Text for the boss HUD banner while the transition lasts. */
    banner?: string;
    /** Required for `kind: 'burrow'`: the stages and where the unit resurfaces. See `burrowPreset`. */
    burrow?: BurrowTransitionDef;
}

/** Stages of a burrow transition, in order. */
export const BURROW_STAGES = ['close', 'sink', 'travel', 'rise'] as const;
export type BurrowStage = (typeof BURROW_STAGES)[number];

/** A world-pixel circle the unit must not resurface inside (plus `minDistanceFromExclusions`). */
export interface SproutExclusionZone {
    x: number;
    y: number;
    radius: number;
}

/**
 * Burrow transition: `close` (a callback closes the unit up, e.g. a Shell), `sink` (the unit goes under; the renderer
 * masks it at ground level), `travel` (it moves along a burrow trail to the chosen point), `rise`. The unit cannot be
 * targeted, damaged or act for the whole transition. All durations are tick-time seconds; the point is chosen once, at
 * the start, so the choice is deterministic and serialized with the transition.
 * Callbacks, point rules and exclusion sources are named in registries (`phaseBurrow.ts`) so defs stay serializable.
 */
export interface BurrowTransitionDef {
    closeSeconds: number;
    sinkSeconds: number;
    travelSeconds: number;
    riseSeconds: number;
    /** Authored world-pixel positions the unit may resurface at (usually one or more per arena segment). */
    sproutPoints: { x: number; y: number }[];
    /** Registered point rule id. Default `'farthestFromParty'`. */
    pointRule?: string;
    /** Candidates closer than this to any exclusion zone edge are dropped (world px). Default 0. */
    minDistanceFromExclusions?: number;
    /** Static zones to keep away from. */
    exclusionZones?: SproutExclusionZone[];
    /** Registered exclusion-source ids whose zones are added at the moment of choosing (e.g. old Briar). */
    exclusionSources?: string[];
    /** Registered callback ids run when a stage begins. */
    callbacks?: Partial<Record<BurrowStage, string>>;
    /** Optional eruption where the unit rises. See `BurrowEruptionDef`. */
    eruption?: BurrowEruptionDef;
}

/**
 * An area burst where a burrowed unit rises. The `rise` stage is the telegraph: the burst lands when the rise
 * completes (`riseSeconds` after the frame), hitting every living enemy of the unit within `radiusPx` of the sprout
 * point for `damage`. With `reactable` (default true) the start of the rise is a reaction frame
 * (`requestReactionFrame`), so players inside the circle who know Reactions may act before it lands.
 */
export interface BurrowEruptionDef {
    /** Blast radius in world px. Give this or `radiusUnitRadii`. */
    radiusPx?: number;
    /** Blast radius as a multiple of the burrowing unit's own radius (so one def fits every size). */
    radiusUnitRadii?: number;
    damage: number;
    /**
     * When the blast circle starts showing: `'rise'` (default) for the rise only, or `'travel'` to mark the
     * resurfacing point from the moment the unit starts moving underground (the fill still grows over the rise).
     */
    telegraphFrom?: 'rise' | 'travel';
    /** Rock chips thrown up when the burst lands (visual only). */
    rockShower?: { count: number };
    /** Open a reaction frame at the start of the rise. Default true. */
    reactable?: boolean;
    /** Stored as the reaction's `abilityId` label. Default `'burrow_eruption'`. */
    label?: string;
}

/** Build a `burrow` transition. */
export function burrowPreset(burrow: BurrowTransitionDef, banner?: string): PhaseTransitionDef {
    return { kind: 'burrow', burrow, ...(banner !== undefined ? { banner } : {}) };
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
    /**
     * The hit that crosses this phase's HP threshold cannot take the unit below it: HP is held at exactly the
     * threshold and the excess is lost, so one burst cannot skip a phase. (`invulnerableSeconds` does NOT do this:
     * it only starts after the crossing hit has landed in full.) Needs a `health_below_percent` threshold in
     * `enterWhen`, directly or inside `all`.
     */
    clampHitAtThreshold?: boolean;
    /** Tag changes; every `requiredTags` / `forbiddenTags` ability gate keeps working off these. */
    tags?: { add?: UnitTag[]; remove?: UnitTag[] };
    /** Explicit ability list changes, for finer control than tags. */
    abilities?: { add?: string[]; remove?: string[] };
    /**
     * Abilities the unit recovers on entering: each gets a use back and one off-schedule AI cast, in
     * list order, as soon as it can be cast (`unitAI/grantedCasts.ts`). E.g. a boss re-opening its
     * signature moves at an HP threshold.
     */
    grantAiCasts?: string[];
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

/**
 * The HP fraction a phase's `enterWhen` requires, when it has an unambiguous one: a `health_below_percent`, or the
 * lowest one inside an `all`. Null otherwise (`any`, or no HP condition).
 */
export function getPhaseEntryHpThreshold(cond: PhaseCondition): number | null {
    if (cond.kind === 'health_below_percent') return cond.threshold;
    if (cond.kind !== 'all') return null;
    let min: number | null = null;
    for (const c of cond.conditions) {
        const t = getPhaseEntryHpThreshold(c);
        if (t !== null && (min === null || t < min)) min = t;
    }
    return min;
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
