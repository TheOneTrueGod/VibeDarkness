import { grantRecoveryChargeToRandomAbility } from '../abilityUses';
import { getAbility } from '../AbilityRegistry';
import { AbilityEventType } from '../Ability';
import type { AbilityStatic, AttackBlockedInfo } from '../Ability';
import { tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import { tryApplyHardCcStun } from '../../crowdControl/tryApplyHardCcStun';
import type { GameEngine } from '../../game/GameEngine';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import type { Projectile } from '../../game/projectiles/Projectile';
import { areEnemies } from '../../game/teams';
import { Effect } from '../../game/effects/Effect';
import { getModifiedAbilityDamage } from '../damageModifiers';
import type { AbilityCondition } from './AbilityCondition';
import { createAbilityEventDispatchState, dispatchAbilityEventRules, type AbilityEventDispatchState } from './AbilityEventDispatcher';
import type { AbilityEffect } from './AbilityEffect';

type CustomConditionHandler = (
    params: Record<string, unknown> | undefined,
    context: AbilityEventRuntimeContext,
) => boolean;
type CustomEffectHandler = (params: Record<string, unknown> | undefined, context: AbilityEventRuntimeContext) => void;

export interface AbilityEventRuntimeContext {
    engine: GameEngineLike;
    caster: Unit;
    ability: AbilityStatic;
    activeAbility?: ActiveAbility;
    targets: ResolvedTarget[];
    eventType: AbilityEventType;
    currentTime: number;
    prevTime: number;
    hitResult?: 'hit' | 'blocked';
    primaryTarget?: Unit;
    attackInfo?: AttackBlockedInfo;
    /** Populated for ON_PROJECTILE_EXPIRED: the projectile that just expired. */
    projectile?: Projectile;
    /** Populated for ON_PROJECTILE_EXPIRED: the unit struck, if the projectile hit one. */
    hitUnit?: Unit;
    customConditionHandlers?: Record<string, CustomConditionHandler>;
    customEffectHandlers?: Record<string, CustomEffectHandler>;
}

interface GameEngineLike {
    gameTime: number;
    roundNumber: number;
    getUnit(id: string): Unit | undefined;
    generateRandomInteger(min: number, max: number): number;
    getPlayerResearchNodes?(playerId: string, treeId: string): string[];
    interruptUnitAndRefundAbilities?(unit: Unit): void;
    eventBus: GameEngine['eventBus'];
    /** All units in the battle (used by grantChargeToNearbyAllies and triggerAoEExplosion). */
    units?: Unit[];
    /** Returns alive allies of `caster`, excluding the caster itself. */
    getAllies?(caster: Unit): Unit[];
    addEffect?(effect: Effect): void;
}

interface CastPayloadWithAbilityEvents {
    __abilityEventDispatchState?: AbilityEventDispatchState;
    __abilityEventFlags?: Record<string, boolean>;
}

export function triggerAbilityEvent(context: AbilityEventRuntimeContext): string[] {
    const rules = context.ability.abilityEvents?.[context.eventType] ?? [];
    if (rules.length === 0) return [];
    const state = getOrCreateDispatchState(context.activeAbility);
    // Merge ability-level custom handlers with call-site handlers; call-site wins on collision.
    const mergedContext: AbilityEventRuntimeContext =
        context.ability.customEffectHandlers
            ? {
                  ...context,
                  customEffectHandlers: {
                      ...(context.ability.customEffectHandlers as Record<string, CustomEffectHandler>),
                      ...context.customEffectHandlers,
                  },
              }
            : context;
    const result = dispatchAbilityEventRules(rules, state, mergedContext, {
        evaluateCondition: evaluateCondition,
        applyEffect: applyEffect,
    });
    return result.matchedRuleIds;
}

export function triggerAbilityEventFromAttack(params: {
    engine: GameEngineLike;
    attackingAbilityId: string;
    sourceUnitId?: string;
    eventType: AbilityEventType;
    primaryTarget?: Unit;
    attackInfo?: AttackBlockedInfo;
    hitResult: 'hit' | 'blocked';
}): string[] {
    const { engine, attackingAbilityId, sourceUnitId, eventType, primaryTarget, attackInfo, hitResult } = params;
    if (!sourceUnitId) return [];
    const caster = engine.getUnit(sourceUnitId);
    if (!caster) return [];
    const ability = getAbility(attackingAbilityId);
    if (!ability) return [];
    const activeAbility = findMostRecentActiveAbility(caster, attackingAbilityId);
    return triggerAbilityEvent({
        engine,
        caster,
        ability,
        activeAbility,
        targets: activeAbility?.targets ?? [],
        eventType,
        currentTime: activeAbility ? Math.max(0, engine.gameTime - activeAbility.startTime) : 0,
        prevTime: activeAbility ? Math.max(0, engine.gameTime - activeAbility.startTime) : 0,
        primaryTarget,
        attackInfo,
        hitResult,
    });
}

export function triggerAbilityEventFromProjectileExpiry(params: {
    engine: unknown;
    projectile: Projectile;
    hitUnitId?: string;
}): void {
    const eng = params.engine as GameEngineLike;
    const { projectile, hitUnitId } = params;
    const caster = eng.getUnit?.(projectile.sourceUnitId);
    if (!caster) return;
    const ability = getAbility(projectile.sourceAbilityId);
    if (!ability) return;
    const activeAbility = findMostRecentActiveAbility(caster, projectile.sourceAbilityId);
    const hitUnit = hitUnitId ? eng.getUnit?.(hitUnitId) : undefined;
    triggerAbilityEvent({
        engine: eng,
        caster,
        ability,
        activeAbility,
        targets: activeAbility?.targets ?? [],
        eventType: AbilityEventType.ON_PROJECTILE_EXPIRED,
        currentTime: activeAbility ? Math.max(0, eng.gameTime - activeAbility.startTime) : 0,
        prevTime: activeAbility ? Math.max(0, eng.gameTime - activeAbility.startTime) : 0,
        projectile,
        hitUnit,
    });
}

function findMostRecentActiveAbility(caster: Unit, abilityId: string): ActiveAbility | undefined {
    const matching = caster.activeAbilities.filter((a) => a.abilityId === abilityId);
    if (matching.length === 0) return undefined;
    matching.sort((a, b) => b.startTime - a.startTime);
    return matching[0];
}

function getOrCreateDispatchState(activeAbility?: ActiveAbility): AbilityEventDispatchState {
    if (!activeAbility) return createAbilityEventDispatchState();
    const payload = (activeAbility.castPayload ?? {}) as CastPayloadWithAbilityEvents;
    if (!payload.__abilityEventDispatchState) {
        payload.__abilityEventDispatchState = createAbilityEventDispatchState();
        activeAbility.castPayload = payload;
    }
    return payload.__abilityEventDispatchState;
}

function getOrCreateAbilityFlags(activeAbility?: ActiveAbility): Record<string, boolean> | null {
    if (!activeAbility) return null;
    const payload = (activeAbility.castPayload ?? {}) as CastPayloadWithAbilityEvents;
    payload.__abilityEventFlags ??= {};
    activeAbility.castPayload = payload;
    return payload.__abilityEventFlags;
}

function evaluateCondition(condition: AbilityCondition, context: AbilityEventRuntimeContext): boolean {
    switch (condition.type) {
        case 'always':
            return true;
        case 'elapsedTimeAtLeast':
            return context.currentTime >= condition.seconds;
        case 'elapsedTimeAtMost':
            return context.currentTime <= condition.seconds;
        case 'targetCountAtLeast':
            return context.targets.length >= condition.count;
        case 'casterHealthAtMostPercent':
            if (context.caster.maxHp <= 0) return false;
            return (context.caster.hp / context.caster.maxHp) * 100 <= condition.percent;
        case 'eventTypeIs':
            return context.eventType === condition.eventType;
        case 'hitResultIs':
            return context.hitResult === condition.result;
        case 'casterHasResearchNode': {
            const ownerId = context.caster.ownerId;
            if (!ownerId || !context.engine.getPlayerResearchNodes) return false;
            const researched = context.engine.getPlayerResearchNodes(ownerId, condition.treeId);
            return researched.includes(condition.nodeId);
        }
        case 'primaryTargetHasBuff':
            return context.primaryTarget?.hasBuff(condition.buffType) ?? false;
        case 'selfRuleHasTriggeredAtLeast': {
            const dispatchState = getOrCreateDispatchState(context.activeAbility);
            return (dispatchState.ruleTriggerCounts[condition.ruleId] ?? 0) >= condition.count;
        }
        case 'custom':
            return context.customConditionHandlers?.[condition.conditionId]?.(condition.params, context) ?? false;
        default:
            return false;
    }
}

function applyEffect(effect: AbilityEffect, context: AbilityEventRuntimeContext): void {
    switch (effect.type) {
        case 'recoverCharge': {
            if (effect.amount <= 0) return;
            const recipient = effect.recipient ?? 'randomAbility';
            if (recipient === 'randomAbility') {
                const baseOpts = effect.excludeCurrentAbility ? { excludeAbilityId: context.ability.id } : {};
                const opts = { ...baseOpts, eventBus: context.engine.eventBus };
                for (let i = 0; i < effect.amount; i++) {
                    grantRecoveryChargeToRandomAbility(
                        context.caster,
                        effect.chargeType,
                        (min, max) => context.engine.generateRandomInteger(min, max),
                        opts,
                    );
                }
            }
            return;
        }
        case 'grantChargeToNearbyAllies': {
            const allies: Unit[] = context.engine.getAllies?.(context.caster)
                ?? (context.engine.units ?? []).filter(
                    u => u.isAlive() && !areEnemies(u.teamId, context.caster.teamId) && u.id !== context.caster.id,
                );
            const rng = (min: number, max: number) => context.engine.generateRandomInteger(min, max);
            const eventBus = context.engine.eventBus;
            for (const ally of allies) {
                if (Math.hypot(ally.x - context.caster.x, ally.y - context.caster.y) > effect.radius) continue;
                for (let i = 0; i < effect.amount; i++) {
                    grantRecoveryChargeToRandomAbility(ally, effect.chargeType, rng, { eventBus });
                }
            }
            if (effect.includeSelf) {
                for (let i = 0; i < effect.amount; i++) {
                    grantRecoveryChargeToRandomAbility(context.caster, effect.chargeType, rng, { eventBus });
                }
            }
            return;
        }
        case 'setFlag': {
            const flags = getOrCreateAbilityFlags(context.activeAbility);
            if (!flags) return;
            flags[effect.flag] = effect.value;
            return;
        }
        case 'applyKnockbackToPrimaryTarget': {
            const target = context.primaryTarget;
            if (!target) return;
            tryApplyKnockbackByTier(
                target,
                effect.tier,
                { unitId: context.caster.id, abilityId: effect.sourceAbilityId },
                context.caster.x,
                context.caster.y,
                context.engine,
            );
            return;
        }
        case 'applyKnockbackToAllTargets': {
            for (const t of context.targets) {
                if (t.type !== 'unit' || t.unitId == null) continue;
                const target = context.engine.getUnit(t.unitId);
                if (!target) continue;
                tryApplyKnockbackByTier(
                    target,
                    effect.tier,
                    { unitId: context.caster.id, abilityId: effect.sourceAbilityId },
                    context.caster.x,
                    context.caster.y,
                    context.engine,
                );
            }
            return;
        }
        case 'applyStunnedToPrimaryTarget': {
            const target = context.primaryTarget;
            if (!target) return;
            tryApplyHardCcStun(target, effect.duration, context.engine.gameTime, context.engine.roundNumber);
            return;
        }
        case 'interruptPrimaryTargetAbilities':
            context.primaryTarget?.interruptAllAbilities();
            return;
        case 'setAbilityNote':
            context.caster.setAbilityNote({ abilityId: effect.abilityId, abilityNote: effect.note });
            return;
        case 'triggerAoEExplosion': {
            const projectile = context.projectile;
            if (!projectile) return;
            const { effectType, effectRadius, damage, maxTargets, knockbackTier, effectDuration = 0.25 } = effect;
            context.engine.addEffect?.(new Effect({
                x: projectile.x,
                y: projectile.y,
                duration: effectDuration,
                effectType,
                effectRadius,
            }));
            const allUnits = context.engine.units ?? [];
            const hits = allUnits
                .filter(u => u.isAlive() && areEnemies(context.caster.teamId, u.teamId))
                .map(u => ({ unit: u, dist: Math.hypot(u.x - projectile.x, u.y - projectile.y) }))
                .filter(e => e.dist <= effectRadius + e.unit.radius)
                .sort((a, b) => a.dist - b.dist)
                .slice(0, maxTargets)
                .map(e => e.unit);
            for (const unit of hits) {
                const modifiedDamage = getModifiedAbilityDamage(context.caster, damage);
                unit.takeDamage(modifiedDamage, context.caster.id, context.engine.eventBus);
                if (knockbackTier != null) {
                    tryApplyKnockbackByTier(
                        unit,
                        knockbackTier,
                        { unitId: context.caster.id, abilityId: context.ability.id },
                        projectile.x,
                        projectile.y,
                        context.engine,
                    );
                }
            }
            return;
        }
        case 'custom':
            context.customEffectHandlers?.[effect.effectId]?.(effect.params, context);
            return;
        default:
            return;
    }
}

export function getAbilityEventFlag(active: ActiveAbility | undefined, flag: string): boolean {
    if (!active?.castPayload) return false;
    const payload = active.castPayload as CastPayloadWithAbilityEvents;
    return payload.__abilityEventFlags?.[flag] ?? false;
}
