import { describe, expect, it } from 'vitest';
import { Unit } from '../../../game/units/Unit';
import { DogBiteAbility } from './0701Ability';

describe('Dog Bite 0701 research damage', () => {
    it('includes abilityModifiers.damageFlat in getDamage', () => {
        const pet = new Unit({
            id: 'dog1',
            x: 0,
            y: 0,
            hp: 48,
            maxHp: 48,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'dog',
            name: 'Dog',
            abilities: ['0701'],
        });
        pet.abilityModifiers = { '0701': { damageFlat: 4 } };

        expect(DogBiteAbility.getDamage?.(pet)).toBe(9); // base 5 + flat 4
        expect(DogBiteAbility.getDamage?.(undefined)).toBe(5);
    });
});
