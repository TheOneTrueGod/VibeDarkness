import { describe, expect, it } from 'vitest';
import { AbilityEventType } from '../../abilities/Ability';
import { ensureAbilityRuntimeState } from '../../abilities/abilityUses';
import { triggerAbilityEventFromAttack } from '../../abilities/events';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import { STUNNED_BUFF_TYPE } from '../../buffs/StunnedBuff';
import { TRAINING_NODE_CHARGING_PUNCH, TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../../researchTrees/trees/training';

function createUnit(config: {
    id: string;
    ownerId: string;
    teamId: 'player' | 'enemy';
    x: number;
    y: number;
    abilities?: string[];
}): Unit {
    return new Unit({
        id: config.id,
        x: config.x,
        y: config.y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: config.teamId,
        ownerId: config.ownerId,
        characterId: config.teamId === 'player' ? 'player' : 'dark_wolf',
        name: config.id,
        abilities: config.abilities ?? [],
    });
}

describe('Punch abilityEvents integration', () => {
    it('grants charging punch light charge on hit but not on block', () => {
        const caster = createUnit({
            id: 'caster',
            ownerId: 'p1',
            teamId: 'player',
            x: 0,
            y: 0,
            abilities: ['0102', 'throw_charged_rock'],
        });
        const defender = createUnit({ id: 'defender', ownerId: 'ai', teamId: 'enemy', x: 10, y: 0, abilities: [] });
        ensureAbilityRuntimeState(caster, 'throw_charged_rock');
        const runtime = caster.abilityRuntime.throw_charged_rock;
        expect(runtime).toBeDefined();
        if (runtime) runtime.currentUses = 0;

        caster.activeAbilities.push({
            abilityId: '0102',
            startTime: 0,
            targets: [{ type: 'pixel', position: { x: 20, y: 0 } }],
        });

        const units = [caster, defender];
        const engine = {
            gameTime: 1,
            roundNumber: 1,
            eventBus: new EventBus(),
            getUnit: (id: string) => units.find((u) => u.id === id),
            generateRandomInteger: (min: number) => min,
            getPlayerResearchNodes: (playerId: string, treeId: string) => {
                if (playerId === 'p1' && treeId === TRAINING_TREE_ID) return [TRAINING_NODE_CHARGING_PUNCH];
                return [];
            },
        };

        triggerAbilityEventFromAttack({
            engine,
            attackingAbilityId: '0102',
            sourceUnitId: caster.id,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            hitResult: 'hit',
            primaryTarget: defender,
        });
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(1);

        if (runtime) runtime.currentUses = 0;
        triggerAbilityEventFromAttack({
            engine,
            attackingAbilityId: '0102',
            sourceUnitId: caster.id,
            eventType: AbilityEventType.ON_ATTACK_BLOCKED,
            hitResult: 'blocked',
            primaryTarget: defender,
        });
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(0);
    });

    it('applies strong punch stun effect on hit', () => {
        const caster = createUnit({
            id: 'caster',
            ownerId: 'p1',
            teamId: 'player',
            x: 0,
            y: 0,
            abilities: ['0102'],
        });
        const defender = createUnit({ id: 'defender', ownerId: 'ai', teamId: 'enemy', x: 8, y: 0, abilities: [] });
        caster.activeAbilities.push({
            abilityId: '0102',
            startTime: 0,
            targets: [{ type: 'pixel', position: { x: 20, y: 0 } }],
        });

        const units = [caster, defender];
        const engine = {
            gameTime: 1,
            roundNumber: 1,
            eventBus: new EventBus(),
            getUnit: (id: string) => units.find((u) => u.id === id),
            generateRandomInteger: (min: number) => min,
            getPlayerResearchNodes: (playerId: string, treeId: string) => {
                if (playerId === 'p1' && treeId === TRAINING_TREE_ID) return [TRAINING_NODE_STRONG_PUNCH];
                return [];
            },
            interruptUnitAndRefundAbilities: (_unit: Unit) => {},
        };

        triggerAbilityEventFromAttack({
            engine,
            attackingAbilityId: '0102',
            sourceUnitId: caster.id,
            eventType: AbilityEventType.ON_ATTACK_HIT,
            hitResult: 'hit',
            primaryTarget: defender,
        });
        expect(defender.hasBuff(STUNNED_BUFF_TYPE)).toBe(true);
    });

    it('does not apply strong punch stun when attack is blocked', () => {
        const caster = createUnit({
            id: 'caster',
            ownerId: 'p1',
            teamId: 'player',
            x: 0,
            y: 0,
            abilities: ['0102'],
        });
        const defender = createUnit({ id: 'defender', ownerId: 'ai', teamId: 'enemy', x: 8, y: 0, abilities: [] });
        caster.activeAbilities.push({
            abilityId: '0102',
            startTime: 0,
            targets: [{ type: 'pixel', position: { x: 20, y: 0 } }],
        });

        const units = [caster, defender];
        const engine = {
            gameTime: 1,
            roundNumber: 1,
            eventBus: new EventBus(),
            getUnit: (id: string) => units.find((u) => u.id === id),
            generateRandomInteger: (min: number) => min,
            getPlayerResearchNodes: (playerId: string, treeId: string) => {
                if (playerId === 'p1' && treeId === TRAINING_TREE_ID) return [TRAINING_NODE_STRONG_PUNCH];
                return [];
            },
            interruptUnitAndRefundAbilities: (_unit: Unit) => {},
        };

        triggerAbilityEventFromAttack({
            engine,
            attackingAbilityId: '0102',
            sourceUnitId: caster.id,
            eventType: AbilityEventType.ON_ATTACK_BLOCKED,
            hitResult: 'blocked',
            primaryTarget: defender,
        });
        expect(defender.hasBuff(STUNNED_BUFF_TYPE)).toBe(false);
    });

    it('runs punch hit/blocked events through tryDamageOrBlock combat flow', () => {
        const caster = createUnit({
            id: 'caster',
            ownerId: 'p1',
            teamId: 'player',
            x: 0,
            y: 0,
            abilities: ['0102', 'throw_charged_rock'],
        });
        const defender = createUnit({
            id: 'defender',
            ownerId: 'ai',
            teamId: 'enemy',
            x: 10,
            y: 0,
            abilities: ['0104'],
        });
        ensureAbilityRuntimeState(caster, 'throw_charged_rock');
        const runtime = caster.abilityRuntime.throw_charged_rock;
        if (runtime) runtime.currentUses = 0;

        const units = [caster, defender];
        const engine = {
            gameTime: 1,
            roundNumber: 1,
            units,
            eventBus: new EventBus(),
            getUnit: (id: string) => units.find((u) => u.id === id),
            generateRandomInteger: (min: number) => min,
            getPlayerResearchNodes: (playerId: string, treeId: string) => {
                if (playerId === 'p1' && treeId === TRAINING_TREE_ID) {
                    return [TRAINING_NODE_CHARGING_PUNCH, TRAINING_NODE_STRONG_PUNCH];
                }
                return [];
            },
            interruptUnitAndRefundAbilities: (_unit: Unit) => {},
        };

        const hitDidDamage = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: '0102',
            damage: 8,
            attackType: 'melee',
        });
        expect(hitDidDamage).toBe(true);
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(1);
        expect(defender.hasBuff(STUNNED_BUFF_TYPE)).toBe(true);

        if (runtime) runtime.currentUses = 0;
        defender.activeAbilities = [
            {
                abilityId: '0104',
                startTime: 0,
                targets: [{ type: 'pixel', position: { x: -10, y: 0 } }],
            },
        ];
        engine.gameTime = 0.5;

        const blockedDidDamage = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: caster.x,
            attackerY: caster.y,
            attackerId: caster.id,
            abilityId: '0102',
            damage: 8,
            attackType: 'melee',
        });
        expect(blockedDidDamage).toBe(false);
        expect(caster.abilityRuntime.throw_charged_rock?.currentUses).toBe(0);
    });
});
