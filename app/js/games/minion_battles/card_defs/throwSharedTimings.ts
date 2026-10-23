/**
 * Shared throw-family timings, More Rock dual-throw pattern, and crystal_rocks research helpers.
 * Used by Throw Rock, Throw Charged Rock, and Throw Knife.
 */

import { AbilityState, type AbilityStateEntry } from '../abilities/Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilities/abilityTimings';
import { hasResearchNode } from '../abilities/abilityModifierHelpers';
import type { AbilityEngineContext } from '../abilities/AbilityEngineContext';
import type { CastBehaviour, CastBehaviourEntry } from '../abilities/castBehaviourTypes';
import { withEntombedWallConditionalCancelAndLinger } from '../abilities/entombed/entombedWallCancel';
import { withComboCancelAtPhaseStart } from '../abilities/comboCancel/comboCancelTimings';
import type { TargetDef } from '../abilities/targeting';
import type { SelectTargetDef } from '../abilities/timingTargetDef';
import { nullHitbox, type HitboxSpec } from '../hitboxes';
import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import type { VisualEffectDef } from '../game/effects/visualEffectDef';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import {
    CHARGED_ROCKS_TREE_ID,
    KNIVES_TREE_ID,
    NODE_MORE_POWER,
    NODE_MORE_ROCK,
    THROWN_WEAPONS_TREE_ID,
} from '../../../researchTrees/trees/weaponTreeIds';

/** Trees whose researched nodes feed the thrown-weapon abilities (item trees + shared Thrown Weapons). */
const THROWN_WEAPON_RESEARCH_TREE_IDS = [
    CRYSTAL_ROCKS_TREE_ID,
    CHARGED_ROCKS_TREE_ID,
    KNIVES_TREE_ID,
    THROWN_WEAPONS_TREE_ID,
] as const;

export const THROW_RANGE = 200;
export const THROW_PROJECTILE_SPEED = 900;

/** One timeline cell for the More Rock dual-throw pattern (14 × slice = 1.4s total). */
export const MORE_ROCK_TIME_SLICE = 0.1;
export const MORE_ROCK_FIRST_THROW = 6 * MORE_ROCK_TIME_SLICE;
export const MORE_ROCK_SECOND_THROW = 10 * MORE_ROCK_TIME_SLICE;
export const MORE_ROCK_COOLDOWN_START = 11 * MORE_ROCK_TIME_SLICE;
export const MORE_ROCK_TOTAL_DURATION = 14 * MORE_ROCK_TIME_SLICE;

export const BASE_THROW_WINDUP_END = 0.3;
export const BASE_THROW_ACTIVE_END = 0.4;
export const BASE_THROW_COOLDOWN_END = 1.6;
export const BASE_MOVEMENT_PENALTY_UNTIL = 0.6;
/** Speed multiplier while a throw is winding up / recovering (0.3 = 30% speed). */
export const BASE_THROW_MOVEMENT_PENALTY = 0.3;

/**
 * Data-driven throw timeline + movement penalty. Throws never stop movement; instead the
 * caster is slowed to `windupMovementPenalty` during the windup and to `movementPenalty`
 * until `movementPenaltyUntil`. Presets below; new throw families add their own preset.
 */
export interface ThrowTimingProfile {
    windupEnd: number;
    activeEnd: number;
    cooldownEnd: number;
    /** Seconds after cast start until the post-windup slow ends. */
    movementPenaltyUntil: number;
    /** Speed multiplier during the windup (lower = slower). */
    windupMovementPenalty: number;
    /** Speed multiplier after the windup until `movementPenaltyUntil`. */
    movementPenalty: number;
    /** Ability `prefireTime` (tracking cutoff) - matches `windupEnd`. */
    prefireTime: number;
}

/** Default throw (Throw Knife): uniform 30% speed until 0.6s. */
export const BASE_THROW_PROFILE: ThrowTimingProfile = {
    windupEnd: BASE_THROW_WINDUP_END,
    activeEnd: BASE_THROW_ACTIVE_END,
    cooldownEnd: BASE_THROW_COOLDOWN_END,
    movementPenaltyUntil: BASE_MOVEMENT_PENALTY_UNTIL,
    windupMovementPenalty: BASE_THROW_MOVEMENT_PENALTY,
    movementPenalty: BASE_THROW_MOVEMENT_PENALTY,
    prefireTime: BASE_THROW_WINDUP_END,
};

/** Rock throws take 20% longer to wind up than the base throw. */
export const ROCK_THROW_WINDUP_SCALE = 1.2;
const ROCK_THROW_WINDUP_EXTRA = BASE_THROW_WINDUP_END * (ROCK_THROW_WINDUP_SCALE - 1);

/**
 * Rock throws (Throw Rock, Earth Core Throw Rock, Throw Charged Rock): windup is 20% longer
 * (0.3s -> 0.36s, rest of the timeline shifted) and the windup slow is heavier (15% speed
 * instead of 30%). Movement is never stopped outright.
 */
export const ROCK_THROW_PROFILE: ThrowTimingProfile = {
    windupEnd: BASE_THROW_WINDUP_END + ROCK_THROW_WINDUP_EXTRA,
    activeEnd: BASE_THROW_ACTIVE_END + ROCK_THROW_WINDUP_EXTRA,
    cooldownEnd: BASE_THROW_COOLDOWN_END + ROCK_THROW_WINDUP_EXTRA,
    movementPenaltyUntil: BASE_MOVEMENT_PENALTY_UNTIL + ROCK_THROW_WINDUP_EXTRA,
    windupMovementPenalty: 0.15,
    movementPenalty: BASE_THROW_MOVEMENT_PENALTY,
    prefireTime: BASE_THROW_WINDUP_END + ROCK_THROW_WINDUP_EXTRA,
};

/** Quick throws take a third less windup than the base throw and recover sooner. */
export const QUICK_THROW_WINDUP_SCALE = 2 / 3;
const QUICK_THROW_WINDUP_SAVED = BASE_THROW_WINDUP_END * (1 - QUICK_THROW_WINDUP_SCALE);
/** Extra recovery trimmed off quick throws on top of the shorter windup. */
const QUICK_THROW_COOLDOWN_TRIM = 0.3;

/**
 * Quick throws (Blood Shard): a flick rather than a wind-up throw. Windup 0.3s -> 0.2s with the
 * rest of the timeline shifted earlier, a shorter recovery, and the standard 30% slow.
 */
export const QUICK_THROW_PROFILE: ThrowTimingProfile = {
    windupEnd: BASE_THROW_WINDUP_END - QUICK_THROW_WINDUP_SAVED,
    activeEnd: BASE_THROW_ACTIVE_END - QUICK_THROW_WINDUP_SAVED,
    cooldownEnd: BASE_THROW_COOLDOWN_END - QUICK_THROW_WINDUP_SAVED - QUICK_THROW_COOLDOWN_TRIM,
    movementPenaltyUntil: BASE_MOVEMENT_PENALTY_UNTIL - QUICK_THROW_WINDUP_SAVED,
    windupMovementPenalty: BASE_THROW_MOVEMENT_PENALTY,
    movementPenalty: BASE_THROW_MOVEMENT_PENALTY,
    prefireTime: BASE_THROW_WINDUP_END - QUICK_THROW_WINDUP_SAVED,
};

export const ONE_PIXEL_TARGET: TargetDef[] = [{ type: 'pixel', label: 'Target location' }];
export const TWO_PIXEL_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: 'Second target (More Rock)' },
];

export type ThrowCastPayload = {
    movementPenaltyUntil: number;
    /** Optional heavier slow while winding up (until `windupPenaltyUntil`). */
    windupPenaltyUntil?: number;
    windupMovementPenalty?: number;
    movementPenalty?: number;
};

export interface EntombedTimingOpts {
    cancelIntervalId: string;
    cooldownIntervalId: string;
    lingerIdPrefix?: string;
}

export function getCrystalRocksResearch(
    engine: AbilityEngineContext | undefined,
    caster?: Unit,
): Set<string> {
    const ownerId = caster?.ownerId
        ?? (engine as AbilityEngineContext & { localPlayerId?: string } | undefined)?.localPlayerId
        ?? '';
    if (!ownerId || !engine?.getPlayerResearchNodes) return new Set<string>();
    const nodes = new Set<string>();
    for (const treeId of THROWN_WEAPON_RESEARCH_TREE_IDS) {
        for (const nodeId of engine.getPlayerResearchNodes(ownerId, treeId)) nodes.add(nodeId);
    }
    return nodes;
}

export function hasMoreRockResearch(research: Set<string>): boolean {
    return research.has(NODE_MORE_ROCK);
}

export function hasMorePowerResearch(research: Set<string>): boolean {
    return research.has(NODE_MORE_POWER);
}

export function hasResearchNodeInCrystalRocks(
    engine: AbilityEngineContext | undefined,
    caster: Unit | undefined,
    nodeId: string,
): boolean {
    return THROWN_WEAPON_RESEARCH_TREE_IDS.some((treeId) => hasResearchNode(engine, caster, treeId, nodeId));
}

/** One-shot projectile launch at the start of an Active interval. */
export function throwLaunchAtWindowStart(
    behaviour: CastBehaviour,
    targetIndex = 0,
): CastBehaviourEntry[] {
    return [{ timingStart: 'start', targetIndex, behaviour }];
}

export interface BuildThrowBaseTimingsOpts {
    /** Timeline preset; explicit `windupEnd`/`activeEnd`/`cooldownEnd` override it. */
    profile?: ThrowTimingProfile;
    windupEnd?: number;
    activeEnd?: number;
    cooldownEnd?: number;
    windupLabel?: string;
    activeLabel?: string;
    cooldownLabel?: string;
    launchBehaviour?: CastBehaviour;
    /** Extra one-shot behaviours when the windup starts (e.g. a windup VFX). */
    windupBehaviours?: CastBehaviour[];
    /** Extra one-shot behaviours at the release frame alongside the launch (e.g. paying an HP cost). */
    releaseBehaviours?: CastBehaviour[];
    /** Visual effects at the projectile's hit / expiry point. */
    onProjectileHit?: VisualEffectDef[];
    entombed?: EntombedTimingOpts;
    /** When set, pipe timings through Combo Cancel at this phase entry (after entombed). */
    comboCancelPhase?: AbilityPhase;
    /** Override the select hitbox (default `nullHitbox`). */
    selectHitbox?: HitboxSpec;
    /** Select filter (default `'any'`). */
    selectFilter?: SelectTargetDef['filter'];
    lockOnMode?: SelectTargetDef['lockOnMode'];
}

function throwSelectTargetDef(
    label: string,
    opts: Pick<BuildThrowBaseTimingsOpts, 'selectHitbox' | 'selectFilter' | 'lockOnMode'>,
): SelectTargetDef {
    return {
        kind: 'select',
        label,
        hitbox: opts.selectHitbox ?? nullHitbox,
        filter: opts.selectFilter ?? 'any',
        allowMiss: true,
        ...(opts.lockOnMode ? { lockOnMode: opts.lockOnMode } : {}),
    };
}

export function buildThrowBaseTimings(opts: BuildThrowBaseTimingsOpts = {}): AbilityTimingInterval[] {
    const profile = opts.profile ?? BASE_THROW_PROFILE;
    const windupEnd = opts.windupEnd ?? profile.windupEnd;
    const activeEnd = opts.activeEnd ?? profile.activeEnd;
    const cooldownEnd = opts.cooldownEnd ?? profile.cooldownEnd;
    const launch = opts.launchBehaviour;
    const windupEntries: CastBehaviourEntry[] = (opts.windupBehaviours ?? [])
        .map((behaviour): CastBehaviourEntry => ({ timingStart: 'start', behaviour }));
    const releaseEntries: CastBehaviourEntry[] = [
        ...(launch ? throwLaunchAtWindowStart(launch, 0) : []),
        ...(opts.releaseBehaviours ?? []).map((behaviour): CastBehaviourEntry => ({ timingStart: 'start', behaviour })),
    ];

    const raw: AbilityTimingInterval[] = [
        {
            id: 'windup',
            start: 0,
            end: windupEnd,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: opts.windupLabel ?? 'Startup',
            timelineDescription: 'Winding up to throw.',
            ...(windupEntries.length > 0 ? { castBehaviours: windupEntries } : {}),
        },
        {
            id: 'active',
            start: windupEnd,
            end: activeEnd,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            timelineLabel: opts.activeLabel ?? 'Active',
            timelineDescription: 'Release frame — projectile is thrown.',
            // Picked right before the throw (same as More Rock), not up front at cast start.
            targetDef: { ...throwSelectTargetDef('Target location', opts), pickAtEntry: true },
            ...(releaseEntries.length > 0 ? { castBehaviours: releaseEntries } : {}),
            ...(opts.onProjectileHit ? { onProjectileHit: opts.onProjectileHit } : {}),
        },
        {
            id: 'cooldown',
            start: activeEnd,
            end: cooldownEnd,
            abilityPhase: AbilityPhase.Cooldown,
            timelineLabel: opts.cooldownLabel ?? 'Cooldown',
            timelineDescription: 'Recovering after the throw.',
        },
    ];

    if (opts.entombed) {
        return applyThrowComboCancel(
            withEntombedWallConditionalCancelAndLinger(raw, opts.entombed),
            opts,
        );
    }
    return applyThrowComboCancel(raw, opts);
}

function applyThrowComboCancel(
    timings: AbilityTimingInterval[],
    opts: Pick<BuildThrowBaseTimingsOpts, 'comboCancelPhase'>,
): AbilityTimingInterval[] {
    if (opts.comboCancelPhase === undefined) return timings;
    return withComboCancelAtPhaseStart(timings, opts.comboCancelPhase, {
        cooldownIntervalId: 'cooldown',
    });
}

export interface BuildMoreRockTimingsOpts {
    launchBehaviour: CastBehaviour;
    entombed?: EntombedTimingOpts;
    comboCancelPhase?: AbilityPhase;
    selectHitbox?: HitboxSpec;
    selectFilter?: SelectTargetDef['filter'];
    lockOnMode?: SelectTargetDef['lockOnMode'];
}

/** Timeline: windup / throw / short windup / throw / cooldown (`::::::=:::=...`). */
export function buildMoreRockTimings(opts: BuildMoreRockTimingsOpts): AbilityTimingInterval[] {
    const { launchBehaviour, entombed } = opts;
    const selectOpts = {
        selectHitbox: opts.selectHitbox,
        selectFilter: opts.selectFilter,
        lockOnMode: opts.lockOnMode,
    };
    const raw: AbilityTimingInterval[] = [
        {
            id: 'windup_1',
            start: 0,
            end: MORE_ROCK_FIRST_THROW,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Startup',
            timelineDescription: 'Winding up for the first throw.',
        },
        {
            id: 'active_1',
            start: MORE_ROCK_FIRST_THROW,
            end: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            timelineLabel: 'First throw',
            timelineDescription: 'First projectile is in flight.',
            // Picked right before the throw, like the second target, not up front at cast start.
            targetDef: { ...throwSelectTargetDef('Target location', selectOpts), pickAtEntry: true },
            castBehaviours: throwLaunchAtWindowStart(launchBehaviour, 0),
        },
        {
            id: 'windup_2',
            start: MORE_ROCK_FIRST_THROW + MORE_ROCK_TIME_SLICE,
            end: MORE_ROCK_SECOND_THROW,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: 'Quick windup',
            timelineDescription: 'Brief pause before the second throw.',
        },
        {
            id: 'active_2',
            start: MORE_ROCK_SECOND_THROW,
            end: MORE_ROCK_SECOND_THROW + MORE_ROCK_TIME_SLICE,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: 'Second throw',
            timelineDescription: 'Second projectile is in flight.',
            targetDef: throwSelectTargetDef('Second target (More Rock)', selectOpts),
            castBehaviours: throwLaunchAtWindowStart(launchBehaviour, 1),
        },
        {
            id: 'cooldown',
            start: MORE_ROCK_COOLDOWN_START,
            end: MORE_ROCK_TOTAL_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
            timelineLabel: 'Cooldown',
            timelineDescription: 'Recovering after both throws.',
        },
    ];

    if (entombed) {
        return applyThrowComboCancel(
            withEntombedWallConditionalCancelAndLinger(raw, entombed),
            opts,
        );
    }
    return applyThrowComboCancel(raw, opts);
}

export function beginThrowCastPayload(
    hasMoreRock: boolean,
    profile: ThrowTimingProfile = BASE_THROW_PROFILE,
): ThrowCastPayload {
    return {
        movementPenaltyUntil: hasMoreRock ? MORE_ROCK_SECOND_THROW : profile.movementPenaltyUntil,
        windupPenaltyUntil: hasMoreRock ? MORE_ROCK_FIRST_THROW : profile.windupEnd,
        windupMovementPenalty: profile.windupMovementPenalty,
        movementPenalty: profile.movementPenalty,
    };
}

function penaltyEntry(amount: number): AbilityStateEntry[] {
    return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount } }];
}

export function throwMovementPenaltyStatesForActive(
    currentTime: number,
    active: ActiveAbility,
): AbilityStateEntry[] {
    const payload = active.castPayload as ThrowCastPayload | undefined;
    const until = payload?.movementPenaltyUntil ?? BASE_MOVEMENT_PENALTY_UNTIL;
    const amount = payload?.movementPenalty ?? BASE_THROW_MOVEMENT_PENALTY;
    if (
        payload?.windupPenaltyUntil !== undefined
        && payload.windupMovementPenalty !== undefined
        && currentTime < payload.windupPenaltyUntil
    ) {
        return penaltyEntry(payload.windupMovementPenalty);
    }
    if (currentTime < until) return penaltyEntry(amount);
    return [];
}

/** Movement-penalty states for a throw at `currentTime` under `profile` (no per-cast payload). */
export function throwMovementPenaltyStates(
    currentTime: number,
    profile: ThrowTimingProfile = BASE_THROW_PROFILE,
): AbilityStateEntry[] {
    if (currentTime < profile.windupEnd) return penaltyEntry(profile.windupMovementPenalty);
    if (currentTime < profile.movementPenaltyUntil) return penaltyEntry(profile.movementPenalty);
    return [];
}
