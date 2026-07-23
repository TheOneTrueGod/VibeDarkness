/**
 * Special-action channel: OrderManager dual apply, ITS finalize preserve, pet helpers.
 */
import { describe, expect, it, vi } from 'vitest';
import { Unit } from './units/Unit';
import { EventBus } from './EventBus';
import { OrderManager } from './managers/OrderManager';
import type { EngineContext } from './EngineContext';
import type { BattleOrder } from './types';
import { buildFinalizedSequentialTargetingOrder } from './interaction/InteractiveTargetingSession';
import {
    commandPetOrderAttack,
    commandPetOrderMove,
} from '../abilities/petCommands';
import type { PetAITreeContext } from './units/unitAI/pet/context';
import { pet_engage } from './units/unitAI/pet/pet_engage';
import type { AIContext } from './units/unitAI/types';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';
import { ORDER_ATTACK_ABILITY_ID } from '../card_defs/07_command_core/0708_OrderAttack/0708Ability';
import { ORDER_MOVE_ABILITY_ID } from '../card_defs/07_command_core/0709_OrderMove/0709Ability';
import { getAbility } from '../abilities/AbilityRegistry';
import { FLING_THORN_ABILITY_ID } from '../card_defs/07_command_core/0705_FlingThorn/0705Ability';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { createTargetDummyAtWorld } from '../testing/fixtures/targetDummies';
function makePet(id = 'pet1'): Unit {
    const pet = new Unit({
        id,
        x: 100,
        y: 100,
        hp: 48,
        maxHp: 48,
        speed: 100,
        teamId: 'player',
        ownerId: TINY_BATTLE_PLAYER_ID,
        characterId: 'dog',
        name: 'Dog',
        abilities: ['0701', FLING_THORN_ABILITY_ID],
    });
    pet.petState.defId = 'dog';
    pet.petState.ownerUnitId = 'player1';
    initializeAbilityRuntimeForUnit(pet);
    return pet;
}

describe('BattleOrder.specialAction / OrderManager', () => {
    it('applies special + primary in one order without occupying activeAbilities for the special', () => {
        const engine = buildTinyBattleEngine({
            gridW: 20,
            gridH: 20,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 50,
            y: 50,
            abilities: ['0101'],
        });
        const pet = makePet();
        pet.petState.ownerUnitId = player.id;
        engine.addUnit(pet, 'initialGameSpawn');
        const enemy = createTargetDummyAtWorld(engine, 200, 100);
        engine.addUnit(enemy, 'initialGameSpawn');

        const batchAt = engine.gameTick;
        engine.state.orderMgr.waitingForOrders = {
            waiters: [{ unitId: player.id, ownerId: TINY_BATTLE_PLAYER_ID }],
            atTick: batchAt,
        };

        const order: BattleOrder = {
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            specialAction: {
                abilityId: ORDER_ATTACK_ABILITY_ID,
                targets: [{ type: 'unit', unitId: enemy.id }],
            },
            endTurn: true,
        };

        engine.state.orderMgr.applyOrder(order);

        const petCtx = pet.aiContext as PetAITreeContext;
        expect(petCtx.targetUnitId).toBe(enemy.id);
        expect(petCtx.orderedFocus).toBe(true);
        expect(petCtx.aiState).toBe('pet_engage');
        // Special must not leave a cast on the player.
        expect(player.activeAbilities.some((a) => a.abilityId === ORDER_ATTACK_ABILITY_ID)).toBe(false);
        expect(player.canAct()).toBe(false); // wait lockout
    });

    it('preserves specialAction when confirming endTurn in place', () => {
        const fingerprints: string[] = [];
        const units = new Map<string, Unit>();
        const player = new Unit({
            id: 'u1',
            x: 0,
            y: 0,
            hp: 100,
            maxHp: 100,
            speed: 50,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'hero',
            name: 'Hero',
            abilities: [],
        });
        units.set(player.id, player);

        const ctx = {
            gameTick: 10,
            gameTime: 1,
            getUnit: (id: string) => units.get(id),
            units: [player],
            mixOrderFingerprint: (_u: string, id: string) => { fingerprints.push(id); },
            cancelActiveAbility: vi.fn(),
            addEffect: vi.fn(),
        } as unknown as EngineContext;

        const om = new OrderManager(ctx, () => {});
        om.waitingForOrders = {
            waiters: [{ unitId: player.id, ownerId: 'p1' }],
            atTick: 10,
        };

        const special = {
            abilityId: ORDER_ATTACK_ABILITY_ID,
            targets: [{ type: 'unit' as const, unitId: 'e1' }],
        };

        om.applyOrder({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            specialAction: special,
        });

        om.applyOrder({
            unitId: player.id,
            abilityId: 'wait',
            targets: [],
            endTurn: true,
        });

        const pending = om.getPendingOrderForUnit(player.id, 10);
        expect(pending?.endTurn).toBe(true);
        expect(pending?.specialAction?.abilityId).toBe(ORDER_ATTACK_ABILITY_ID);
        expect(fingerprints.some((f) => f.startsWith('special:'))).toBe(true);
    });
});

describe('buildFinalizedSequentialTargetingOrder', () => {
    it('preserves specialAction from baseOrder on commit', () => {
        const base: BattleOrder = {
            unitId: 'u1',
            abilityId: '0116',
            targets: [],
            specialAction: {
                abilityId: ORDER_MOVE_ABILITY_ID,
                targets: [{ type: 'pixel', position: { x: 10, y: 20 } }],
            },
        };
        const finalized = buildFinalizedSequentialTargetingOrder(
            ['Target 1'],
            { 'Target 1': { type: 'unit', unitId: 'e1' } },
            base,
        );
        expect(finalized.specialAction?.abilityId).toBe(ORDER_MOVE_ABILITY_ID);
        expect(finalized.endTurn).toBe(true);
        expect(finalized.targets[0]?.unitId).toBe('e1');
    });
});

describe('Order: Attack / Order: Move abilities', () => {
    it('Order: Attack applySpecialAction sets sticky focus', () => {
        const ability = getAbility(ORDER_ATTACK_ABILITY_ID);
        expect(ability?.actionChannel).toBe('special');
        expect(ability?.applySpecialAction).toBeTypeOf('function');

        const caster = new Unit({
            id: 'player1',
            x: 0,
            y: 0,
            hp: 100,
            maxHp: 100,
            speed: 50,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'hero',
            name: 'Hero',
            abilities: [ORDER_ATTACK_ABILITY_ID],
        });
        const pet = makePet();
        pet.petState.ownerUnitId = caster.id;
        const effects: unknown[] = [];
        ability!.applySpecialAction!(
            caster,
            [{ type: 'unit', unitId: 'enemy_x' }],
            {
                units: [caster, pet],
                gameTime: 1,
                addEffect: (e: unknown) => { effects.push(e); },
            },
        );
        const ctx = pet.aiContext as PetAITreeContext;
        expect(ctx.orderedFocus).toBe(true);
        expect(ctx.targetUnitId).toBe('enemy_x');
        expect(effects.length).toBe(1);
    });

    it('Order: Move cancels basicAttack casts but not others', () => {
        const pet = makePet();
        pet.activeAbilities.push(
            { abilityId: '0701', startTime: 0, targets: [] } as Unit['activeAbilities'][number],
            { abilityId: '0702', startTime: 0, targets: [] } as Unit['activeAbilities'][number],
        );
        const cancelled: string[] = [];
        commandPetOrderMove(
            [pet],
            { x: 300, y: 100 },
            {
                gameTime: 1,
                gameTick: 10,
                cancelActiveAbility: (_id, abilityId) => { cancelled.push(abilityId); },
                terrainManager: null,
            },
        );
        expect(cancelled).toEqual(['0701']);
        const ctx = pet.aiContext as PetAITreeContext;
        expect(ctx.aiState).toBe('pet_ordered_move');
        expect(ctx.orderedMoveX).toBe(300);
        expect(ctx.orderedMoveY).toBe(100);
        expect(ctx.orderedFocus).toBe(false);
    });
});

describe('pet_engage orderedFocus', () => {
    it('does not steal focus to a nearer enemy while orderedFocus is set', () => {
        const pet = makePet();
        pet.x = 0;
        pet.y = 0;
        const locked = new Unit({
            id: 'far',
            x: 120,
            y: 0,
            hp: 20,
            maxHp: 20,
            speed: 50,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'swarmling',
            name: 'Far',
            abilities: [],
        });
        const nearer = new Unit({
            id: 'near',
            x: 40,
            y: 0,
            hp: 20,
            maxHp: 20,
            speed: 50,
            teamId: 'enemy',
            ownerId: 'ai',
            characterId: 'swarmling',
            name: 'Near',
            abilities: [],
        });
        const owner = new Unit({
            id: 'player1',
            x: 10,
            y: 0,
            hp: 100,
            maxHp: 100,
            speed: 50,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'hero',
            name: 'Hero',
            abilities: [],
        });

        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_engage';
        ctx.targetUnitId = locked.id;
        ctx.orderedFocus = true;
        ctx.lastScanTime = -Infinity;

        pet.abilityRuntime['0701']!.currentUses = 0;
        pet.abilityRuntime[FLING_THORN_ABILITY_ID]!.currentUses = 0;

        const aiContext = {
            gameTime: 10,
            gameTick: 60,
            getUnit: (id: string) => {
                if (id === locked.id) return locked;
                if (id === nearer.id) return nearer;
                if (id === owner.id) return owner;
                return undefined;
            },
            getUnits: () => [pet, locked, nearer, owner],
            queueOrder: () => {},
            emitTurnEnd: () => {},
            findGridPathForUnit: () => null,
            WORLD_WIDTH: 2000,
            WORLD_HEIGHT: 2000,
            terrainManager: null,
            generateRandomInteger: (min: number) => min,
            eventBus: new EventBus(),
        } as unknown as AIContext;

        pet_engage.actions.execute(pet, aiContext);
        expect(ctx.targetUnitId).toBe(locked.id);
        expect(ctx.orderedFocus).toBe(true);
    });
});

describe('commandPetOrderAttack', () => {
    it('clears heel and ordered move when locking focus', () => {
        const pet = makePet();
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_heel';
        ctx.heelUntilGameTime = 999;
        ctx.orderedMoveX = 1;
        ctx.orderedMoveY = 2;

        commandPetOrderAttack([pet], 'enemy1', {
            gameTime: 5,
            addEffect: vi.fn(),
        });

        expect(ctx.aiState).toBe('pet_engage');
        expect(ctx.heelUntilGameTime).toBeUndefined();
        expect(ctx.orderedMoveX).toBeUndefined();
        expect(ctx.targetUnitId).toBe('enemy1');
    });
});
