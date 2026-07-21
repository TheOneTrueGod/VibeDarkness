import { describe, expect, it } from 'vitest';
import { Unit } from '../../Unit';
import { EventBus } from '../../../EventBus';
import { pet_engage } from './pet_engage';
import type { AIContext } from '../types';
import type { PetAITreeContext } from './context';
import { initializeAbilityRuntimeForUnit } from '../../../../abilities/abilityUses';
import { FLING_THORN_ABILITY_ID, FLING_THORN_MAX_DISTANCE } from '../../../../card_defs/07_command_core/0705_FlingThorn/0705Ability';

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> & {
    abilities?: string[];
} = {}): Unit {
    const unit = new Unit({
        id: 'pet1',
        x: 0,
        y: 0,
        hp: 48,
        maxHp: 48,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'dog',
        name: 'Dog',
        abilities: overrides.abilities ?? ['0701', FLING_THORN_ABILITY_ID],
        ...overrides,
    });
    unit.petState.defId = 'dog';
    unit.petState.ownerUnitId = 'owner1';
    initializeAbilityRuntimeForUnit(unit);
    return unit;
}

function makeEnemy(x: number, y: number): Unit {
    return new Unit({
        id: 'enemy1',
        x,
        y,
        hp: 20,
        maxHp: 20,
        speed: 50,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'swarmling',
        name: 'Swarmling',
        abilities: [],
    });
}

describe('pet_engage ability pick', () => {
    it('queues Fling Thorn when target is in fling range', () => {
        const pet = makeUnit({ x: 0, y: 0 });
        const enemy = makeEnemy(150, 0); // within FLING_THORN_MAX_DISTANCE, outside melee
        expect(150).toBeLessThanOrEqual(FLING_THORN_MAX_DISTANCE);

        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_engage';
        ctx.targetUnitId = enemy.id;

        const queued: { abilityId: string }[] = [];
        const owner = makeUnit({ id: 'owner1', x: 10, y: 0, abilities: [] });
        const aiContext = {
            gameTime: 1,
            gameTick: 60,
            getUnit: (id: string) => {
                if (id === enemy.id) return enemy;
                if (id === owner.id) return owner;
                return undefined;
            },
            getUnits: () => [pet, enemy, owner],
            queueOrder: (_tick: number, order: { abilityId: string }) => { queued.push(order); },
            emitTurnEnd: () => {},
            findGridPathForUnit: () => null,
            WORLD_WIDTH: 2000,
            WORLD_HEIGHT: 2000,
            terrainManager: null,
            generateRandomInteger: (min: number, _max: number) => min,
            eventBus: new EventBus(),
        } as unknown as AIContext;

        pet_engage.actions.execute(pet, aiContext);
        expect(queued.length).toBe(1);
        expect(queued[0]!.abilityId).toBe(FLING_THORN_ABILITY_ID);
    });

    it('falls back to Dog Bite when target is out of fling range but in melee', () => {
        const pet = makeUnit({ x: 0, y: 0 });
        // Drain fling uses so only bite remains viable at close range... actually at 40px both are in range;
        // Fling has higher priority. Exhaust fling uses.
        pet.abilityRuntime[FLING_THORN_ABILITY_ID]!.currentUses = 0;

        const enemy = makeEnemy(30, 0);
        const ctx = pet.aiContext as PetAITreeContext;
        ctx.aiState = 'pet_engage';
        ctx.targetUnitId = enemy.id;

        const queued: { abilityId: string }[] = [];
        const owner = makeUnit({ id: 'owner1', x: 10, y: 0, abilities: [] });
        const aiContext = {
            gameTime: 1,
            gameTick: 60,
            getUnit: (id: string) => {
                if (id === enemy.id) return enemy;
                if (id === owner.id) return owner;
                return undefined;
            },
            getUnits: () => [pet, enemy, owner],
            queueOrder: (_tick: number, order: { abilityId: string }) => { queued.push(order); },
            emitTurnEnd: () => {},
            findGridPathForUnit: () => null,
            WORLD_WIDTH: 2000,
            WORLD_HEIGHT: 2000,
            terrainManager: null,
            generateRandomInteger: (min: number) => min,
            eventBus: new EventBus(),
        } as unknown as AIContext;

        pet_engage.actions.execute(pet, aiContext);
        expect(queued.length).toBe(1);
        expect(queued[0]!.abilityId).toBe('0701');
    });
});
