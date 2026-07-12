import { describe, it, expect, vi } from 'vitest';
import { tryDamageOrBlock } from './blockingHelpers';
import { registerAbilityForTest } from './AbilityRegistry';
import type { AbilityStatic } from './Ability';
import { AbilityEventType } from './Ability';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { ShieldBuff } from '../buffs/ShieldBuff';

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'defender',
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

function makeEngine() {
    return {
        gameTime: 1,
        roundNumber: 1,
        getUnit: () => undefined,
        generateRandomInteger: () => 0,
        eventBus: new EventBus(),
    };
}

describe('tryDamageOrBlock with a ShieldBuff', () => {
    it('a hit fully absorbed by a shield fires onAttackBlocked and returns { hit: false, amountDealt: 0 }', () => {
        const onAttackBlocked = vi.fn();
        const attackingAbility = {
            id: 'test_attacker_full_block',
            name: 'Test Attacker',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            targets: [],
            onAttackBlocked,
        } as unknown as AbilityStatic;
        registerAbilityForTest(attackingAbility);

        const defender = makeUnit();
        defender.buffs = [new ShieldBuff(30, 0)];
        const engine = makeEngine();

        const outcome = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: 10,
            attackerY: 0,
            attackerId: 'attacker',
            abilityId: attackingAbility.id,
            damage: 10,
            attackType: 'melee',
        });

        expect(outcome).toEqual({ hit: false, amountDealt: 0 });
        expect(onAttackBlocked).toHaveBeenCalledTimes(1);
        expect((defender.buffs[0] as ShieldBuff).remainingHp).toBe(20);
        expect(defender.hp).toBe(40);
    });

    it('a hit exceeding the shield deals the excess as normal ON_ATTACK_HIT damage and does not fire onAttackBlocked', () => {
        const onAttackBlocked = vi.fn();
        const attackingAbility = {
            id: 'test_attacker_partial_block',
            name: 'Test Attacker',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            targets: [],
            onAttackBlocked,
            abilityEvents: {
                [AbilityEventType.ON_ATTACK_HIT]: [],
            },
        } as unknown as AbilityStatic;
        registerAbilityForTest(attackingAbility);

        const defender = makeUnit();
        defender.buffs = [new ShieldBuff(10, 0)];
        const engine = makeEngine();

        const outcome = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: 10,
            attackerY: 0,
            attackerId: 'attacker',
            abilityId: attackingAbility.id,
            damage: 15,
            attackType: 'melee',
        });

        expect(outcome).toEqual({ hit: true, amountDealt: 15 });
        expect(onAttackBlocked).not.toHaveBeenCalled();
        expect((defender.buffs[0] as ShieldBuff).remainingHp).toBe(0);
        expect(defender.hp).toBe(35);
    });
});
