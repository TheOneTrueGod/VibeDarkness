import { describe, it, expect, vi } from 'vitest';
import { tryDamageOrBlock } from './blockingHelpers';
import { registerAbilityForTest } from './AbilityRegistry';
import type { AbilityStatic } from './Ability';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';

const IFRAME_TEST_DAMAGE = 10;
const IFRAME_TEST_GAME_TIME = 1;

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
        gameTime: IFRAME_TEST_GAME_TIME,
        roundNumber: 1,
        getUnit: () => undefined,
        generateRandomInteger: () => 0,
        eventBus: new EventBus(),
    };
}

describe('tryDamageOrBlock with iFrames', () => {
    it('misses without damage or block side-effects when defender has iFrames', () => {
        const onAttackBlocked = vi.fn();
        const attackingAbility = {
            id: 'test_attacker_iframe_miss',
            name: 'Test Attacker',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            targets: [],
            onAttackBlocked,
        } as unknown as AbilityStatic;
        registerAbilityForTest(attackingAbility);

        const defender = makeUnit();
        vi.spyOn(defender, 'hasIFrames').mockReturnValue(true);
        const engine = makeEngine();
        const hpBefore = defender.hp;

        const outcome = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: 10,
            attackerY: 0,
            attackerId: 'attacker',
            abilityId: attackingAbility.id,
            damage: IFRAME_TEST_DAMAGE,
            attackType: 'melee',
        });

        expect(outcome).toEqual({ hit: false, amountDealt: 0 });
        expect(defender.hp).toBe(hpBefore);
        expect(onAttackBlocked).not.toHaveBeenCalled();
    });

    it('deals damage when respectIFrames is false even if defender has iFrames', () => {
        const attackingAbility = {
            id: 'test_attacker_iframe_true_strike',
            name: 'Test Attacker',
            image: '',
            resourceCost: null,
            rechargeTurns: 0,
            targets: [],
        } as unknown as AbilityStatic;
        registerAbilityForTest(attackingAbility);

        const defender = makeUnit();
        vi.spyOn(defender, 'hasIFrames').mockReturnValue(true);
        const engine = makeEngine();

        const outcome = tryDamageOrBlock(defender, {
            engine,
            gameTime: engine.gameTime,
            eventBus: engine.eventBus,
            attackerX: 10,
            attackerY: 0,
            attackerId: 'attacker',
            abilityId: attackingAbility.id,
            damage: IFRAME_TEST_DAMAGE,
            attackType: 'melee',
            respectIFrames: false,
        });

        expect(outcome).toEqual({ hit: true, amountDealt: IFRAME_TEST_DAMAGE });
        expect(defender.hp).toBe(40 - IFRAME_TEST_DAMAGE);
    });
});
