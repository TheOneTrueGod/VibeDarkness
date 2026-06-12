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
import type { TargetDef } from '../abilities/targeting';
import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import { CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';

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

export const ONE_PIXEL_TARGET: TargetDef[] = [{ type: 'pixel', label: 'Target location' }];
export const TWO_PIXEL_TARGETS: TargetDef[] = [
    { type: 'pixel', label: 'Target location' },
    { type: 'pixel', label: 'Second target (More Rock)' },
];

export type ThrowCastPayload = {
    movementPenaltyUntil: number;
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
    return new Set(engine.getPlayerResearchNodes(ownerId, CRYSTAL_ROCKS_TREE_ID));
}

export function hasMoreRockResearch(research: Set<string>): boolean {
    return research.has('more_rock');
}

export function hasMorePowerResearch(research: Set<string>): boolean {
    return research.has('more_power');
}

export function hasResearchNodeInCrystalRocks(
    engine: AbilityEngineContext | undefined,
    caster: Unit | undefined,
    nodeId: string,
): boolean {
    return hasResearchNode(engine, caster, CRYSTAL_ROCKS_TREE_ID, nodeId);
}

/** One-shot projectile launch at the start of an Active interval. */
export function throwLaunchAtWindowStart(
    behaviour: CastBehaviour,
    targetIndex = 0,
): CastBehaviourEntry[] {
    return [{ timingStart: 'start', targetIndex, behaviour }];
}

export interface BuildThrowBaseTimingsOpts {
    windupEnd?: number;
    activeEnd?: number;
    cooldownEnd?: number;
    windupLabel?: string;
    activeLabel?: string;
    cooldownLabel?: string;
    launchBehaviour?: CastBehaviour;
    entombed?: EntombedTimingOpts;
}

export function buildThrowBaseTimings(opts: BuildThrowBaseTimingsOpts = {}): AbilityTimingInterval[] {
    const windupEnd = opts.windupEnd ?? BASE_THROW_WINDUP_END;
    const activeEnd = opts.activeEnd ?? BASE_THROW_ACTIVE_END;
    const cooldownEnd = opts.cooldownEnd ?? BASE_THROW_COOLDOWN_END;
    const launch = opts.launchBehaviour;

    const raw: AbilityTimingInterval[] = [
        {
            id: 'windup',
            start: 0,
            end: windupEnd,
            abilityPhase: AbilityPhase.Windup,
            timelineLabel: opts.windupLabel ?? 'Startup',
            timelineDescription: 'Winding up to throw.',
        },
        {
            id: 'active',
            start: windupEnd,
            end: activeEnd,
            abilityPhase: AbilityPhase.Active,
            timelineLabel: opts.activeLabel ?? 'Active',
            timelineDescription: 'Release frame — projectile is thrown.',
            ...(launch ? { castBehaviours: throwLaunchAtWindowStart(launch, 0) } : {}),
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
        return withEntombedWallConditionalCancelAndLinger(raw, opts.entombed);
    }
    return raw;
}

export interface BuildMoreRockTimingsOpts {
    launchBehaviour: CastBehaviour;
    entombed?: EntombedTimingOpts;
}

/** Timeline: windup / throw / short windup / throw / cooldown (`::::::=:::=...`). */
export function buildMoreRockTimings(opts: BuildMoreRockTimingsOpts): AbilityTimingInterval[] {
    const { launchBehaviour, entombed } = opts;
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
            timelineLabel: 'First throw',
            timelineDescription: 'First projectile is in flight.',
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
        return withEntombedWallConditionalCancelAndLinger(raw, entombed);
    }
    return raw;
}

export function beginThrowCastPayload(hasMoreRock: boolean): ThrowCastPayload {
    return {
        movementPenaltyUntil: hasMoreRock ? MORE_ROCK_SECOND_THROW : BASE_MOVEMENT_PENALTY_UNTIL,
    };
}

export function throwMovementPenaltyStatesForActive(
    currentTime: number,
    active: ActiveAbility,
): AbilityStateEntry[] {
    const payload = active.castPayload as ThrowCastPayload | undefined;
    const until = payload?.movementPenaltyUntil ?? BASE_MOVEMENT_PENALTY_UNTIL;
    if (currentTime < until) {
        return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } }];
    }
    return [];
}

export function throwMovementPenaltyStates(currentTime: number): AbilityStateEntry[] {
    if (currentTime < BASE_MOVEMENT_PENALTY_UNTIL) {
        return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0.3 } }];
    }
    return [];
}
