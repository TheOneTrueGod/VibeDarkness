/**
 * Unit tests for the pet system:
 *   1. getPetsFromResearch — returns pet IDs for researched nodes
 *   2. Pet spawn round-trip — toJSON/fromJSON preserves link fields
 *   3. applyDirectionalKnockback — pushes along passed vector
 *   4. commandHeel — heals + sets heel state
 */
import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { getPetsFromResearch } from '../../../../researchTrees/evaluator';
import { COMMAND_CORE_TREE_ID, COMMAND_CORE_NODE_LOYAL_COMPANION } from '../../../../researchTrees/trees/command_core';
import { applyDirectionalKnockback } from '../../crowdControl/knockbackKeywords';
import { commandHeel } from '../../abilities/petCommands';
import type { PetAITreeContext } from './unitAI/pet/context';

// ---- helpers ----

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'u1',
        x: 0,
        y: 0,
        hp: 40,
        maxHp: 40,
        speed: 100,
        teamId: 'player',
        ownerId: 'ai',
        characterId: 'dog',
        name: 'Dog',
        ...overrides,
    });
}

function makeEngineLike(units: Unit[] = []) {
    const effects: unknown[] = [];
    return {
        units,
        gameTime: 5,
        gameTick: 10,
        roundNumber: 1,
        eventBus: new EventBus(),
        addEffect: (e: unknown) => effects.push(e),
        state: {
            orderMgr: {
                queueOrder: () => {},
            },
        },
        interruptUnitAndRefundAbilities: (_u: Unit) => {},
        _effects: effects,
    };
}

// ---- 1. getPetsFromResearch ----

describe('getPetsFromResearch', () => {
    it('returns ["dog"] when loyal_companion is researched', () => {
        const research = { [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION] };
        expect(getPetsFromResearch(research)).toEqual(['dog']);
    });

    it('returns [] when no research', () => {
        expect(getPetsFromResearch(undefined)).toEqual([]);
        expect(getPetsFromResearch({})).toEqual([]);
    });

    it('returns [] when a different node is researched', () => {
        const research = { [COMMAND_CORE_TREE_ID]: ['heel'] };
        expect(getPetsFromResearch(research)).toEqual([]);
    });
});

// ---- 2. Pet field round-trip ----

describe('Pet unit toJSON / fromJSON', () => {
    it('restores petOwnerUnitId, petUnitIds, petDefId', () => {
        const eb = new EventBus();
        const dog = makeUnit({ id: 'dog1' });
        dog.petOwnerUnitId = 'owner1';
        dog.petUnitIds = [];
        dog.petDefId = 'dog';

        const owner = makeUnit({ id: 'owner1' });
        owner.petUnitIds = ['dog1'];

        const dogJson = dog.toJSON();
        const restoredDog = Unit.fromJSON(dogJson, eb);

        expect(restoredDog.petOwnerUnitId).toBe('owner1');
        expect(restoredDog.petDefId).toBe('dog');
        expect(restoredDog.petUnitIds).toEqual([]);

        const ownerJson = owner.toJSON();
        const restoredOwner = Unit.fromJSON(ownerJson, eb);
        expect(restoredOwner.petUnitIds).toEqual(['dog1']);
    });

    it('backward-compatible: missing fields default correctly', () => {
        const eb = new EventBus();
        // Simulate old save data with no pet fields.
        const unit = makeUnit();
        const json = unit.toJSON();
        // Remove pet fields to simulate old save.
        const data = json as Record<string, unknown>;
        delete data.petOwnerUnitId;
        delete data.petUnitIds;
        delete data.petDefId;

        const restored = Unit.fromJSON(json, eb);
        expect(restored.petOwnerUnitId).toBeUndefined();
        expect(restored.petUnitIds).toEqual([]);
        expect(restored.petDefId).toBeUndefined();
    });
});

// ---- 3. applyDirectionalKnockback ----

describe('applyDirectionalKnockback', () => {
    it('displaces the target along the passed direction (tier 2)', () => {
        const target = makeUnit({ id: 'target', teamId: 'enemy', x: 100, y: 100 });
        // No CC armour or resistance.
        target.hardCcArmourFloor = 0;
        target.bonusHardCcArmour = 0;

        const engine = makeEngineLike();

        const result = applyDirectionalKnockback(
            target,
            2,
            { x: 1, y: 0 }, // push rightward
            { unitId: 'attacker', abilityId: '0702' },
            {
                gameTime: engine.gameTime,
                roundNumber: engine.roundNumber,
                eventBus: engine.eventBus,
                interruptUnitAndRefundAbilities: engine.interruptUnitAndRefundAbilities,
            },
        );

        expect(result.outcome).toBe('applied');
        // Knockback vector should be in the +x direction.
        const kv = target.knockback?.knockbackVector;
        expect(kv).toBeDefined();
        expect(kv!.x).toBeGreaterThan(0);
        expect(Math.abs(kv!.y)).toBeLessThan(1); // minimal y component
    });
});

// ---- 4. commandHeel ----

describe('commandHeel', () => {
    it('heals 25% max HP (capped at maxHp)', () => {
        const pet = makeUnit({ hp: 32, maxHp: 40 }); // 32 hp, heals 10 → 40 (capped)
        const engine = makeEngineLike([pet]);
        commandHeel(makeUnit({ id: 'owner' }), [pet], engine, {
            healFraction: 0.25,
            tetherRange: 30,
            durationSeconds: 10,
        });
        expect(pet.hp).toBe(40);
    });

    it('caps heal at maxHp', () => {
        const pet = makeUnit({ hp: 39, maxHp: 40 }); // heals 10, capped at 40
        const engine = makeEngineLike([pet]);
        commandHeel(makeUnit({ id: 'owner' }), [pet], engine, {
            healFraction: 0.25,
            tetherRange: 30,
            durationSeconds: 10,
        });
        expect(pet.hp).toBe(40);
    });

    it('sets heelUntilGameTime and heelTetherRange on aiContext', () => {
        const pet = makeUnit();
        pet.aiContext = { aiTree: 'pet' } as PetAITreeContext;
        const engine = makeEngineLike([pet]);

        commandHeel(makeUnit({ id: 'owner' }), [pet], engine, {
            healFraction: 0.25,
            tetherRange: 30,
            durationSeconds: 10,
        });

        const ctx = pet.aiContext as PetAITreeContext;
        expect(ctx.heelUntilGameTime).toBe(engine.gameTime + 10);
        expect(ctx.heelTetherRange).toBe(30);
        expect(ctx.targetUnitId).toBeUndefined();
    });

    it('adds a Pulse VFX effect on each pet', () => {
        const pet = makeUnit();
        const engine = makeEngineLike([pet]);
        commandHeel(makeUnit({ id: 'owner' }), [pet], engine, {
            healFraction: 0.25,
            tetherRange: 30,
            durationSeconds: 10,
        });
        expect(engine._effects.length).toBeGreaterThan(0);
    });
});
