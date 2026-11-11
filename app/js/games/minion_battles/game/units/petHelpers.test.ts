/**
 * `inheritOwnerAbilityModifiers`: a pet takes its owner's research modifiers for the abilities it has
 * (e.g. Thorn Volley on Fling Thorns), merged on top of its own.
 */
import { describe, expect, it } from 'vitest';
import { Unit } from './Unit';
import { inheritOwnerAbilityModifiers } from './petHelpers';

function unit(id: string, abilities: string[]): Unit {
    const u = new Unit({
        id, x: 0, y: 0, hp: 50, maxHp: 50, speed: 100, teamId: 'player', ownerId: 'p1',
        characterId: 'target_dummy', name: id,
    });
    u.abilities.push(...abilities);
    return u;
}

describe('inheritOwnerAbilityModifiers', () => {
    it("copies the owner's modifiers for the pet's abilities only", () => {
        const owner = unit('o', ['0713']);
        owner.abilityModifiers = { '0705': { repeatCountFlat: 3 }, '0713': { damageFlat: 2 } };
        const pet = unit('p', ['0701', '0705']);
        inheritOwnerAbilityModifiers(pet, owner);
        expect(pet.abilityModifiers).toEqual({ '0705': { repeatCountFlat: 3 } });
    });

    it("adds to the pet's own modifiers", () => {
        const owner = unit('o', []);
        owner.abilityModifiers = { '0701': { damageFlat: 1 } };
        const pet = unit('p', ['0701']);
        pet.abilityModifiers = { '0701': { damageFlat: 4 } };
        inheritOwnerAbilityModifiers(pet, owner);
        expect(pet.abilityModifiers['0701']?.damageFlat).toBe(5);
    });
});
