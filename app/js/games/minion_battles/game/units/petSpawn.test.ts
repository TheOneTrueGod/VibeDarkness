/**
 * `spawnPetForOwner`: the one entry point for putting a pet on the field (mission-start spirit, Displacement
 * Strike's clones). A spawned `spirit_clone` is a living pet of its owner with the given abilities and modifiers.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import '../../abilities/AbilityRegistry';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import { getModifiedAbilityDamage } from '../../abilities/damageModifiers';
import { ATTACK_DAMAGE_MULT_PER_POINT, PassiveStatKey } from '../../../../researchTrees/types';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { peekPetState } from './components/petComponent';
import { getPetDef } from './pet_defs/petDef';
import { getLivingPetsOfUnit } from './petHelpers';
import { spawnPetForOwner } from './petSpawn';
import { hasUnitTag, UnitTag } from './unitTag';

function battle() {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    return { engine, player };
}

describe('spawnPetForOwner', () => {
    it("spawns a spirit_clone as a living pet of the owner with the given abilities and the source's bite damage", () => {
        const { engine, player } = battle();
        const abilityIds = ['0701', '0702', '0710', '0711', '0714'];
        const clone = spawnPetForOwner(engine, player, {
            petDefId: 'spirit_clone',
            at: { x: 260, y: 200 },
            abilityIds,
            maxHp: 30,
            abilityModifiers: { '0701': { damageFlat: 3 } },
            spawnSource: 'abilitySpawn',
        });

        expect(clone).toBeDefined();
        expect(getLivingPetsOfUnit(player, engine.units)).toContain(clone);
        expect(peekPetState(clone!)?.defId).toBe('spirit_clone');
        expect(clone!.abilities).toEqual(abilityIds);
        expect(clone!.abilityModifiers['0701']?.damageFlat).toBe(3);
        expect(clone!.maxHp).toBe(30);
        expect(clone!.hp).toBe(30);
        expect(clone!.teamId).toBe(player.teamId);
        expect(getPetDef('spirit_clone')?.autoEngage).toBe(true);
        expect(getPetDef('spirit_clone')?.reactions).toBeUndefined();
        expect(hasUnitTag(clone!, UnitTag.Clone)).toBe(true);
    });

    it("inherits the owner's modifiers unless told not to (a full copy of another pet's)", () => {
        const { engine, player } = battle();
        player.abilityModifiers = { ...player.abilityModifiers, '0701': { damageFlat: 2 } };
        const base = { petDefId: 'spirit_clone', at: { x: 260, y: 200 }, abilityIds: ['0701'], maxHp: 30 } as const;

        const inheriting = spawnPetForOwner(engine, player, {
            ...base,
            abilityModifiers: { '0701': { damageFlat: 3 } },
            spawnSource: 'abilitySpawn',
        });
        const copied = spawnPetForOwner(engine, player, {
            ...base,
            at: { x: 140, y: 200 },
            abilityModifiers: { '0701': { damageFlat: 5 } },
            inheritOwnerModifiers: false,
            spawnSource: 'abilitySpawn',
        });

        expect(inheriting!.abilityModifiers['0701']?.damageFlat).toBe(5);
        expect(copied!.abilityModifiers['0701']?.damageFlat).toBe(5);
    });

    it("carries the owner's Attack, so each point raises the pet's damage too", () => {
        const { engine, player } = battle();
        const ownerAttack = 3;
        const petBase = 10;
        player.passiveBonuses = { ...player.passiveBonuses, [PassiveStatKey.Attack]: { add: ownerAttack, mult: 1 } };
        const pet = spawnPetForOwner(engine, player, {
            petDefId: 'spirit_clone',
            at: { x: 260, y: 200 },
            abilityIds: ['0701'],
            maxHp: 30,
            spawnSource: 'abilitySpawn',
        });

        expect(pet!.passiveBonuses?.[PassiveStatKey.Attack]?.add).toBe(ownerAttack);
        expect(pet!.getDamageModifier().multiplier).toBeCloseTo(1 + ownerAttack * ATTACK_DAMAGE_MULT_PER_POINT);
        expect(getModifiedAbilityDamage(pet!, petBase)).toBe(
            Math.round(petBase * (1 + ownerAttack * ATTACK_DAMAGE_MULT_PER_POINT)),
        );
    });

    it('leaves a pet of an owner with no Attack unmodified', () => {
        const { engine, player } = battle();
        player.passiveBonuses = undefined;
        const pet = spawnPetForOwner(engine, player, {
            petDefId: 'spirit_clone',
            at: { x: 260, y: 200 },
            abilityIds: ['0701'],
            maxHp: 30,
            spawnSource: 'abilitySpawn',
        });
        expect(pet!.getDamageModifier().multiplier).toBe(1);
    });

    it('returns undefined for an unknown pet def', () => {
        const { engine, player } = battle();
        expect(
            spawnPetForOwner(engine, player, {
                petDefId: 'nope',
                at: { x: 0, y: 0 },
                abilityIds: [],
                maxHp: 1,
                spawnSource: 'abilitySpawn',
            }),
        ).toBeUndefined();
    });
});
