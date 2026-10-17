import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { getAbility } from '../../abilities/AbilityRegistry';
import { AbilityState, getAbilityResourceCosts, type AbilityStatic } from '../../abilities/Ability';
import { canUseAbilityNow, unitAbilityHasTag } from '../../abilities/abilityUses';
import type { ActiveAbility } from '../types';
import { getLivingPetsOfUnit } from './petHelpers';
import {
    AbilityPhase,
    getCoveringAbilityPhaseAtElapsed,
    getTotalAbilityDurationForCast,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
    getDoNotRefundCutoffElapsed,
} from '../../abilities/abilityTimings';

/**
 * Get the unit's effective speed accounting for movement penalties
 * from all active abilities. Takes the lowest penalty multiplier.
 */
export function getUnitEffectiveSpeed(unit: Unit, gameTime: number): number {
    let lowestPenalty = 1;

    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;

        const currentTime = gameTime - active.startTime;
        const states =
            ability.getAbilityStatesForActive?.(currentTime, active) ??
            ability.getAbilityStates(currentTime);

        for (const entry of states) {
            if (entry.state === AbilityState.MOVEMENT_PENALTY) {
                lowestPenalty = Math.min(lowestPenalty, entry.data.amount);
            }
        }
    }

    return unit.speed * lowestPenalty;
}

/**
 * Whether the unit currently has invincibility frames from any active ability.
 * When true, projectiles should not deal damage to this unit.
 */
export function unitHasIFrames(unit: Unit, gameTime: number): boolean {
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;

        const currentTime = gameTime - active.startTime;
        const states =
            ability.getAbilityStatesForActive?.(currentTime, active) ??
            ability.getAbilityStates(currentTime);

        for (const entry of states) {
            if (entry.state === AbilityState.IFRAMES) return true;
        }
    }
    return false;
}

/** True while the unit is executing a timing interval tagged 'juggernaut' (immune to CC interruption). */
export function isUnitInJuggernautWindow(unit: Unit, gameTime: number): boolean {
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const elapsed = gameTime - active.startTime;
        const intervals = normalizeAbilityTimingsToIntervals(ability.abilityTimings);
        if (intervals.some((it) => it.start <= elapsed && elapsed < it.end && it.tags?.includes('juggernaut'))) {
            return true;
        }
    }
    return false;
}

/**
 * Returns the effective lunge distance for an ability, applying terrain speed multipliers.
 * The same two terrain layers used for movement speed are applied here.
 * Designed to be extended later with per-weapon-class research bonuses.
 */
export function getUnitLungeDistance(unit: Unit, engine: unknown, baseLungeDistance: number): number {
    let modifier = 1;
    const terrainLayers = (engine as { terrainLayers?: TerrainLayerManager }).terrainLayers;
    if (terrainLayers) modifier *= terrainLayers.getGroundMovementMultiplier(unit.x, unit.y);
    const terrainManager = (engine as { terrainManager?: TerrainManager }).terrainManager ?? null;
    if (terrainManager) modifier *= terrainManager.getSpeedMultiplier(unit.x, unit.y);
    return Math.floor(baseLungeDistance * modifier);
}

/**
 * Returns true if the unit has an active Entombed-tagged ability that is NOT yet in a Cooldown/CoopCooldown phase.
 * Used by tickWallUnstick to suppress the generic wall slingshot while abilities manage their own wall exit.
 */
export function isEntombedProtectionActive(unit: Unit, engine: EngineContext): boolean {
    for (const active of unit.activeAbilities) {
        if (!unitAbilityHasTag(unit, active.abilityId, 'Entombed')) continue;
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const entries = resolveAbilityTimingEntries(ability, unit, engine);
        const intervals = normalizeAbilityTimingsToIntervals(entries);
        const elapsed = engine.gameTime - active.startTime;
        const totalDuration = getTotalAbilityDurationForCast(ability, unit, engine);
        if (elapsed >= totalDuration) continue;
        const phase = getCoveringAbilityPhaseAtElapsed(elapsed, intervals);
        // Cooldown / coop-cooldown and uncovered elapsed (gaps or post-interval) allow generic wall eject.
        if (
            phase === null
            || phase === AbilityPhase.Cooldown
            || phase === AbilityPhase.CoopCooldown
        ) {
            continue;
        }
        return true;
    }
    return false;
}

/**
 * Whether `unit` has any ability it could choose at a conditional-cancel (Combo / Entombed) pause of
 * `paused`: carries every tag in `tagFilter` (any ability when empty), has a use left, is affordable once
 * the paused cast's cost is refunded (as OrderManager does before the follow-up casts), and has a living
 * pet when it is pet-sourced. When false the pause has no real choice and the cast just continues (Pass).
 */
export function hasConditionalCancelFollowUp(
    unit: Unit,
    paused: ActiveAbility,
    tagFilter: readonly string[] | undefined,
    engine: EngineContext,
): boolean {
    const refund = new Map<string, number>();
    const pausedAbility = getAbility(paused.abilityId);
    if (pausedAbility) {
        const elapsed = Math.max(0, engine.gameTime - paused.startTime);
        if (elapsed < getDoNotRefundCutoffElapsed(pausedAbility, unit)) {
            for (const cost of getAbilityResourceCosts(pausedAbility, unit)) {
                refund.set(cost.resourceId, (refund.get(cost.resourceId) ?? 0) + cost.amount);
            }
        }
    }
    const canAffordAfterRefund = (ability: AbilityStatic): boolean => {
        for (const cost of getAbilityResourceCosts(ability, unit)) {
            const resource = unit.getResource(cost.resourceId);
            if (!resource) return false;
            const available = Math.min(resource.max, resource.current + (refund.get(cost.resourceId) ?? 0));
            if (cost.allowPartialIfPositive ? available <= 0 : available < cost.amount) return false;
        }
        if (ability.hpCost != null && (ability.hpCostGate ?? 'requireSurplus') === 'requireSurplus') {
            if (unit.hp <= ability.hpCost) return false;
        }
        return true;
    };

    const candidateIds = new Set<string>();
    for (const abilityId of unit.abilities) {
        candidateIds.add(abilityId);
        const modeIds = getAbility(abilityId)?.abilityModes?.modeAbilityIds;
        for (const modeId of Object.values(modeIds ?? {})) candidateIds.add(modeId);
    }
    for (const abilityId of candidateIds) {
        const ability = getAbility(abilityId);
        if (!ability) continue;
        if (tagFilter?.some((tag) => !unitAbilityHasTag(unit, abilityId, tag))) continue;
        if (!canUseAbilityNow(unit, ability)) continue;
        if (!canAffordAfterRefund(ability)) continue;
        if (ability.abilitySource?.type === 'pet' && getLivingPetsOfUnit(unit, engine.units).length === 0) continue;
        return true;
    }
    return false;
}
