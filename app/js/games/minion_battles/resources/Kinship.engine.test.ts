/**
 * Kinship through the real engine: a permanent pet's bite (0701) gains Kinship for its owner;
 * a temporary (ephemeral) clone's bite does not.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility } from '../abilities/AbilityRegistry';
import { FIXED_DT } from '../game/gameConstants';
import { GameEngine } from '../game/GameEngine';
import type { Unit } from '../game/units/Unit';
import { executeUnitAbility } from '../game/units/unitAbilityLifecycle';
import { spawnPetForOwner } from '../game/units/petSpawn';
import { petStateOf } from '../game/units/components/petComponent';
import { CORE_ITEM_IDS } from '../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../testing/harness/buildTinyBattleEngine';
import { DogBiteAbility } from '../card_defs/07_command_core/0701_DogBite/0701Ability';
import { DISPLACEMENT_STRIKE_CLONE_PET_DEF_ID } from '../card_defs/07_command_core/0716_DisplacementStrikePet/0716Ability';
import { KINSHIP_STARTING_AMOUNT } from './Kinship';
import { ResourceId } from './resourceIds';

function step(engine: GameEngine, seconds: number): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

function battle(opts: { ephemeral: boolean }) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 120, y: 120 },
        equipment: [CORE_ITEM_IDS.CommandCore],
    });
    const pet = spawnPetForOwner(engine, player, {
        petDefId: opts.ephemeral ? DISPLACEMENT_STRIKE_CLONE_PET_DEF_ID : 'dog',
        at: { x: 200, y: 200 },
        abilityIds: [DogBiteAbility.id],
        maxHp: 30,
        spawnSource: 'abilitySpawn',
        ...(opts.ephemeral ? { ephemeralDespawnAtGameTime: 60 } : {}),
    })!;
    if (!petStateOf(player).unitIds.includes(pet.id)) petStateOf(player).unitIds.push(pet.id);
    const dummy = placeTargetDummy(engine, { x: 240, y: 200 }, 'dummy');
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player, pet, dummy };
}

function biteAndSettle(engine: GameEngine, pet: Unit, dummy: Unit): void {
    executeUnitAbility(pet, getAbility(DogBiteAbility.id)!, [{ type: 'unit', unitId: dummy.id }], engine);
    step(engine, 0.6);
}

describe('Kinship (engine)', () => {
    it('gains Kinship when the owner’s permanent pet bites an enemy', () => {
        const { engine, player, pet, dummy } = battle({ ephemeral: false });
        const startHp = dummy.hp;
        biteAndSettle(engine, pet, dummy);
        expect(dummy.hp).toBeLessThan(startHp);
        expect(player.getResource(ResourceId.Kinship)?.current).toBe(KINSHIP_STARTING_AMOUNT + 1);
    });

    it('still gains Kinship after the engine is restored from a checkpoint', () => {
        const { engine, player, pet, dummy } = battle({ ephemeral: false });
        const restored = GameEngine.fromJSON(JSON.parse(JSON.stringify(engine.toJSON())), TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        restored.waitingForOrders = null;
        restored.isPaused = false;
        biteAndSettle(restored, restored.getUnit(pet.id)!, restored.getUnit(dummy.id)!);
        expect(restored.getUnit(player.id)!.getResource(ResourceId.Kinship)?.current).toBe(KINSHIP_STARTING_AMOUNT + 1);
    });

    it('a temporary clone’s bite gains no Kinship', () => {
        const { engine, player, pet, dummy } = battle({ ephemeral: true });
        const startHp = dummy.hp;
        biteAndSettle(engine, pet, dummy);
        expect(dummy.hp).toBeLessThan(startHp);
        expect(player.getResource(ResourceId.Kinship)?.current).toBe(KINSHIP_STARTING_AMOUNT);
    });
});
