import type { HitboxSpec } from '../hitboxes/HitboxSpec';

/** AI auto-resolution for a select step (see `buildAiSelectTargets`). */
export type SelectTargetAiHint =
    | { kind: 'pixelFromAnchor'; direction: 'awayFromCaster'; distance: 'maxFromAnchor' };

/** Player clicks to select a target via this hitbox. */
export interface SelectTargetDef {
    kind: 'select';
    label: string;
    hitbox: HitboxSpec;
    filter: 'enemy' | 'ally' | 'any';
    allowMiss?: boolean;
    /**
     * Let the caster be a valid candidate for this select step (e.g. a self-castable
     * `filter: 'ally'` heal). Requires the paired hitbox to also opt in (e.g.
     * `unitRangeHitbox(range, minRange, true)`) — this flag alone does not surface the
     * caster if the hitbox itself already excluded them from the raw candidate list.
     * Defaults to false (every hitbox excludes the caster by convention).
     */
    includeSelf?: boolean;
    /**
     * How many targets this timing window is expected to hit simultaneously.
     * Drives the preview highlight count. Defaults to the hitbox's own `numTargets`
     * (i.e. `selectDef.hitbox.numTargets`), which is itself 1 unless overridden.
     * Set explicitly only when the targetDef highlight count should differ from the hitbox default.
     */
    numTargets?: number;
    /**
     * Extra px beyond (caster.radius + target.radius) at which the windup telegraph tether breaks.
     * When set, the telegraph freezes when distance > caster.radius + target.radius + maxLockOnExtra,
     * rather than using the hitbox-derived default (hitboxMaxRange + 100px).
     */
    maxLockOnExtra?: number;
    /**
     * `label` of an earlier `SelectTargetDef` on this ability (by declaration order in
     * `abilityTimings`). This step's pixel pick — clamp radius, preview line origin, and
     * AI landing resolution — are relative to that prior step's resolved target (e.g. the
     * unit locked in step 1), not the caster.
     */
    anchorLabel?: string;
    /** Max distance (px) from the anchor unit center for pixel picks. */
    maxRangeFromAnchor?: number;
    /** Min distance (px) from the anchor for pixel picks (avoids zero-vector launches). */
    minRangeFromAnchor?: number;
    /** Optional AI auto-resolution for this select step. */
    aiHint?: SelectTargetAiHint;
}

/**
 * Pause ITS after windup (or whenever this interval enters) so the player can confirm
 * or undo. Click does not change ability geometry — preview draws `radius` at the
 * ability source (caster, or pet when `abilitySource: 'pet'`).
 */
export interface ConfirmRadiusTargetDef {
    kind: 'confirmRadius';
    label: string;
    /** Preview circle radius in world px. */
    radius: number;
    /** When true (default), any click confirms. */
    allowMiss?: boolean;
}

/** Reuse a target that was committed by an earlier SelectTargetDef timing. */
export interface HitTargetDef {
    kind: 'hit';
    labels: string[];
}

export type TimingTargetDef = SelectTargetDef | ConfirmRadiusTargetDef | HitTargetDef;

/** Target defs that pause ITS for player input (select lock-on or confirm-radius). */
export type InteractiveTargetDef = SelectTargetDef | ConfirmRadiusTargetDef;

export function isSelectTargetDef(d: TimingTargetDef): d is SelectTargetDef { return d.kind === 'select'; }
export function isConfirmRadiusTargetDef(d: TimingTargetDef): d is ConfirmRadiusTargetDef {
    return d.kind === 'confirmRadius';
}
export function isInteractiveTargetDef(d: TimingTargetDef): d is InteractiveTargetDef {
    return d.kind === 'select' || d.kind === 'confirmRadius';
}
export function isHitTargetDef(d: TimingTargetDef): d is HitTargetDef    { return d.kind === 'hit'; }
