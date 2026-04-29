import { describe, expect, it } from 'vitest';
import { AbilityEventType } from '../Ability';
import { ensureAbilityRuntimeState } from '../abilityUses';
import { Unit } from '../../game/units/Unit';
import { EventBus } from '../../game/EventBus';
import { triggerAbilityEvent, type AbilityEventRuntimeContext } from './AbilityEventRuntime';
import { AbilityPhase } from '../abilityTimings';

function createUnit(config?: Partial<{ id: string; ownerId: string; abilities: string[]; hp: number; maxHp: number }>): Unit {
    return new Unit({
        id: config?.id ?? 'unit_1',
        x: 0,
        y: 0,
        hp: config?.hp ?? 100,
        maxHp: config?.maxHp ?? 100,
        speed: 100,
        teamId: 'player',
        ownerId: config?.ownerId ?? 'p1',
        characterId: 'player',
        name: 'Test Unit',
        abilities: config?.abilities ?? [],
    });
}

describe('AbilityEventRuntime', () => {
    it('evaluates built-in AND conditions and executes built-in effects', () => {
        const caster = createUnit({ id: 'caster', abilities: ['throw_charged_rock'] });
        ensureAbilityRuntimeState(caster, 'throw_charged_rock');
        const runtime = caster.abilityRuntime.throw_charged_rock;
        expect(runtime).toBeDefined();
        if (runtime) runtime.currentUses = 0;

        const activeAbility = { abilityId: 'test_ability', startTime: 0, targets: [{ type: 'pixel' as const }] };
        const ability = {
            id: 'test_ability',
            name: 'Test',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'x', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
            getTooltipText: () => [''],
            doCardEffect: () => {},
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [
                    {
                        id: 'combo_rule',
                        conditions: [
                            { type: 'eventTypeIs', eventType: AbilityEventType.ON_ATTACK_HIT },
                            { type: 'hitResultIs', result: 'hit' },
                            { type: 'targetCountAtLeast', count: 1 },
                        ],
                        effects: [
                            { type: 'setFlag', flag: 'didHit', value: true },
                            { type: 'recoverCharge', chargeType: 'lightCharge', amount: 1, recipient: 'randomAbility' },
                        ],
                    },
                ],
            },
        };

        const context: AbilityEventRuntimeContext = {
            engine: {
                gameTime: 1,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus: new EventBus(),
                generateRandomInteger: (min) => min,
                getPlayerResearchNodes: () => [],
            },
            caster,
            ability,
            activeAbility,
            targets: activeAbility.targets,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            currentTime: 1,
            prevTime: 0.5,
            hitResult: 'hit',
        };

        const matchedRuleIds = triggerAbilityEvent(context);
        expect(matchedRuleIds).toEqual(['combo_rule']);
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(1);
    });

    it('evaluates rules in deterministic priority order and applies OR semantics across rules', () => {
        const caster = createUnit({ id: 'caster', ownerId: 'p1', abilities: ['throw_charged_rock'] });
        ensureAbilityRuntimeState(caster, 'throw_charged_rock');
        const runtime = caster.abilityRuntime.throw_charged_rock;
        if (runtime) runtime.currentUses = 0;

        const activeAbility = { abilityId: 'test_ability', startTime: 0, targets: [{ type: 'pixel' as const }] };
        const ability = {
            id: 'test_ability',
            name: 'Test',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'x', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
            getTooltipText: () => [''],
            doCardEffect: () => {},
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [
                    {
                        id: 'low_priority',
                        priority: 1,
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'setFlag', flag: 'resolvedLow', value: true }],
                    },
                    {
                        id: 'high_priority',
                        priority: 100,
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'setFlag', flag: 'resolvedHigh', value: true }],
                    },
                ],
            },
        };

        const context: AbilityEventRuntimeContext = {
            engine: {
                gameTime: 1,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus: new EventBus(),
                generateRandomInteger: (min) => min,
                getPlayerResearchNodes: () => [],
            },
            caster,
            ability,
            activeAbility,
            targets: activeAbility.targets,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            currentTime: 1,
            prevTime: 0.5,
            hitResult: 'hit',
        };

        const matchedRuleIds = triggerAbilityEvent(context);
        expect(matchedRuleIds).toEqual(['high_priority', 'low_priority']);
    });

    it('honors oncePerCast trigger caps while preserving rule evaluation semantics', () => {
        const caster = createUnit({ id: 'caster', ownerId: 'p1', abilities: ['throw_charged_rock'] });
        ensureAbilityRuntimeState(caster, 'throw_charged_rock');
        const runtime = caster.abilityRuntime.throw_charged_rock;
        if (runtime) runtime.currentUses = 0;

        const activeAbility = { abilityId: 'test_ability', startTime: 0, targets: [{ type: 'pixel' as const }] };
        const ability = {
            id: 'test_ability',
            name: 'Test',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'x', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
            getTooltipText: () => [''],
            doCardEffect: () => {},
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [
                    {
                        id: 'single_trigger_recover',
                        oncePerCast: true,
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'recoverCharge', chargeType: 'lightCharge', amount: 1 }],
                    },
                ],
            },
        };

        const context: AbilityEventRuntimeContext = {
            engine: {
                gameTime: 1,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus: new EventBus(),
                generateRandomInteger: (min) => min,
                getPlayerResearchNodes: () => [],
            },
            caster,
            ability,
            activeAbility,
            targets: activeAbility.targets,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            currentTime: 1,
            prevTime: 0.5,
            hitResult: 'hit',
        };

        const firstMatchedRuleIds = triggerAbilityEvent(context);
        const secondMatchedRuleIds = triggerAbilityEvent(context);
        expect(firstMatchedRuleIds).toEqual(['single_trigger_recover']);
        expect(secondMatchedRuleIds).toEqual([]);
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(1);
    });

    it('keeps declaration order when priorities tie', () => {
        const caster = createUnit({ id: 'caster', ownerId: 'p1' });
        const activeAbility = { abilityId: 'test_ability', startTime: 0, targets: [] };
        const appliedFlags: string[] = [];
        const ability = {
            id: 'test_ability',
            name: 'Test',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'x', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
            getTooltipText: () => [''],
            doCardEffect: () => {},
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [
                    {
                        id: 'first_declared',
                        priority: 10,
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'custom', effectId: 'push', comment: 'track order', params: { flag: 'first' } }],
                    },
                    {
                        id: 'second_declared',
                        priority: 10,
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'custom', effectId: 'push', comment: 'track order', params: { flag: 'second' } }],
                    },
                ],
            },
        };

        const context: AbilityEventRuntimeContext = {
            engine: {
                gameTime: 1,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus: new EventBus(),
                generateRandomInteger: (min) => min,
            },
            caster,
            ability,
            activeAbility,
            targets: activeAbility.targets,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            currentTime: 1,
            prevTime: 0.5,
            hitResult: 'hit',
            customEffectHandlers: {
                push: (params) => {
                    const flag = typeof params?.flag === 'string' ? params.flag : null;
                    if (flag) appliedFlags.push(flag);
                },
            },
        };

        const matchedRuleIds = triggerAbilityEvent(context);
        expect(matchedRuleIds).toEqual(['first_declared', 'second_declared']);
        expect(appliedFlags).toEqual(['first', 'second']);
    });
});
