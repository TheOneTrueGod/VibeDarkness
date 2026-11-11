/**
 * A 0-damage attack (e.g. Pounce, which only locks on and stuns) still lands: it is a hit, not a block.
 */
import { describe, it, expect } from 'vitest';
import { tryDamageOrBlock } from './blockingHelpers';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { ShieldBuff } from '../buffs/ShieldBuff';

function makeDefender(): Unit {
    return new Unit({
        id: 'defender', x: 0, y: 0, hp: 40, maxHp: 40, speed: 100,
        teamId: 'enemy', ownerId: 'ai', characterId: 'target_dummy', name: 'Dummy',
    });
}

function hitWithZero(defender: Unit) {
    const eventBus = new EventBus();
    const engine = { gameTime: 1, roundNumber: 1, getUnit: () => undefined, generateRandomInteger: () => 0, eventBus };
    return tryDamageOrBlock(defender, {
        engine, gameTime: 1, eventBus, attackerX: 10, attackerY: 0, attackerId: 'attacker',
        abilityId: 'no_such_ability', damage: 0, attackType: 'charging', fireAbilityEvents: false,
    });
}

describe('tryDamageOrBlock with 0 damage', () => {
    it('counts as a hit and deals no damage', () => {
        const defender = makeDefender();
        expect(hitWithZero(defender)).toEqual({ hit: true, amountDealt: 0 });
        expect(defender.hp).toBe(40);
    });

    it('counts as a hit on a shielded unit and leaves the shield untouched', () => {
        const defender = makeDefender();
        defender.buffs = [new ShieldBuff(30, 0)];
        expect(hitWithZero(defender).hit).toBe(true);
        expect((defender.buffs[0] as ShieldBuff).remainingHp).toBe(30);
    });
});
