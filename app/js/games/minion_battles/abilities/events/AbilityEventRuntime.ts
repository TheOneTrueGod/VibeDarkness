import { grantRecoveryChargeToRandomAbility } from '../abilityUses';
import { getAbility } from '../AbilityRegistry';
import { getDirectionFromTo } from '../targetHelpers';
import type { AbilityEventType, AbilityStatic, AttackBlockedInfo } from '../Ability';
import { StunnedBuff } from '../../buffs/StunnedBuff';
import type { GameEngine } from '../../game/GameEngine';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
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
}

interface CastPayloadWithAbilityEvents {
    __abilityEventDispatchState?: AbilityEventDispatchState;
    __abilityEventFlags?: Record<string, boolean>;
}

export function triggerAbilityEvent(context: AbilityEventRuntimeContext): string[] {
    const rules = context.ability.abilityEvents?.[context.eventType] ?? [];
    if (rules.length === 0) return [];
    const state = getOrCreateDispatchState(context.activeAbility);
    const result = dispatchAbilityEventRules(rules, state, context, {
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
                for (let i = 0; i < effect.amount; i++) {
                    grantRecoveryChargeToRandomAbility(
                        context.caster,
                        effect.chargeType,
                        (min, max) => context.engine.generateRandomInteger(min, max),
                    );
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
            const { dirX, dirY } = getDirectionFromTo(context.caster.x, context.caster.y, target.x, target.y);
            target.applyKnockback(
                effect.poiseDamage,
                {
                    knockbackVector: { x: dirX * effect.magnitude, y: dirY * effect.magnitude },
                    knockbackAirTime: effect.airTime,
                    knockbackSlideTime: effect.slideTime,
                    knockbackSource: { unitId: context.caster.id, abilityId: effect.sourceAbilityId },
                },
                context.engine.eventBus,
                (unit) => context.engine.interruptUnitAndRefundAbilities?.(unit),
            );
            return;
        }
        case 'applyStunnedToPrimaryTarget': {
            const target = context.primaryTarget;
            if (!target) return;
            target.addBuff(new StunnedBuff(effect.duration), context.engine.gameTime, context.engine.roundNumber);
            return;
        }
        case 'interruptPrimaryTargetAbilities':
            context.primaryTarget?.interruptAllAbilities();
            return;
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
