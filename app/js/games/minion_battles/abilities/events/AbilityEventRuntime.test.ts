import { describe, expect, it } from 'vitest';
import { AbilityEventType, type AbilityStatic } from '../Ability';
import { ensureAbilityRuntimeState } from '../abilityUses';
import { CARD_ID as PUNCH_ABILITY_ID } from '../../card_defs/0120_PunchNEW/0120Ability';
import { CARD_ID as DOUBLE_PUNCH_ABILITY_ID } from '../../card_defs/0116_DoublePunch/0116Ability';
import { Unit } from '../../game/units/Unit';
import { EventBus } from '../../game/EventBus';
import { triggerAbilityEvent, type AbilityEventRuntimeContext } from './AbilityEventRuntime';
import { AbilityPhase } from '../abilityTimings';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

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
        } as AbilityStatic;

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
        } as AbilityStatic;

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
        } as AbilityStatic;

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
        } as AbilityStatic;

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

    it('clearTerrainEffects clears a circle of ground effects around the caster and emits an event', () => {
        const caster = createUnit({ id: 'caster' });
        caster.x = CELL_SIZE * 2.5;
        caster.y = CELL_SIZE * 2.5;
        const terrainLayers = new TerrainLayerManager();
        for (const [id, col, row, layer] of [
            ['near', 2, 2, 'ground'],
            ['far', 6, 6, 'ground'],
            ['air-near', 2, 2, 'air'],
        ] as const) {
            terrainLayers.add({
                id,
                layer,
                effectType: 'bramble_slow',
                placedAtGameTime: 0,
                area: { type: 'cell', col, row },
                params: {},
            });
        }
        const eventBus = new EventBus();
        const events: unknown[] = [];
        eventBus.on('terrain_effects_cleared', (e) => events.push(e));
        const activeAbility = { abilityId: 'test_ability', startTime: 0, targets: [] };
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
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [
                    {
                        id: 'scour_rule',
                        conditions: [{ type: 'always' }],
                        effects: [{ type: 'clearTerrainEffects', clear: 'scour', radiusPx: 5, at: 'caster' }],
                    },
                ],
            },
        } as AbilityStatic;

        triggerAbilityEvent({
            engine: {
                gameTime: 1,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus,
                generateRandomInteger: (min) => min,
                terrainLayers,
            },
            caster,
            ability,
            activeAbility,
            targets: [],
            eventType: AbilityEventType.ON_ATTACK_HIT,
            currentTime: 1,
            prevTime: 0.5,
            hitResult: 'hit',
        });

        expect(terrainLayers.getGroundEffectAt(2, 2)).toBeNull();
        expect(terrainLayers.getGroundEffectAt(6, 6)?.id).toBe('far');
        expect(terrainLayers.getEffectsCoveringCell('air', 2, 2)).toHaveLength(1);
        expect(events).toHaveLength(1);
    });

    it('restores one use of the punch the caster has', () => {
        const caster = createUnit({ abilities: [DOUBLE_PUNCH_ABILITY_ID] });
        ensureAbilityRuntimeState(caster, DOUBLE_PUNCH_ABILITY_ID);
        ensureAbilityRuntimeState(caster, PUNCH_ABILITY_ID);
        caster.abilityRuntime[DOUBLE_PUNCH_ABILITY_ID]!.currentUses = 0;
        caster.abilityRuntime[PUNCH_ABILITY_ID]!.currentUses = 0;

        const ability = {
            id: 'dodge_like',
            name: 'Dodge-like',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            prefireTime: 0,
            targets: [],
            abilityTimings: [{ id: 'x', start: 0, end: 1, abilityPhase: AbilityPhase.Active }],
            getTooltipText: () => [''],
            getAbilityStates: () => [],
            onAttackBlocked: () => {},
            abilityEvents: {
                [AbilityEventType.ON_CAST_START]: [
                    {
                        conditions: [{ type: 'always' }],
                        effects: [{
                            type: 'restoreUses',
                            abilityIds: [PUNCH_ABILITY_ID, DOUBLE_PUNCH_ABILITY_ID],
                            amount: 1,
                        }],
                    },
                ],
            },
        } as AbilityStatic;

        triggerAbilityEvent({
            engine: {
                gameTime: 0,
                roundNumber: 1,
                getUnit: () => caster,
                eventBus: new EventBus(),
                generateRandomInteger: (min) => min,
            },
            caster,
            ability,
            activeAbility: { abilityId: ability.id, startTime: 0, targets: [] },
            targets: [],
            eventType: AbilityEventType.ON_CAST_START,
            currentTime: 0,
            prevTime: 0,
        });

        expect(caster.abilityRuntime[DOUBLE_PUNCH_ABILITY_ID]!.currentUses).toBe(1);
        expect(caster.abilityRuntime[PUNCH_ABILITY_ID]!.currentUses).toBe(0);
    });
});
