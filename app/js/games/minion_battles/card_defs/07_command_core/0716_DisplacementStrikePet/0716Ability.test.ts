/**
 * Displacement Strike (spirit side, 0716): the spirit splits into two clones round the target, which dash
 * through it with the spirit, then hunt for their lifetime and fade. A recast replaces the earlier clones.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility } from '../../../abilities/AbilityRegistry';
import { grantRecoveryChargeToAbility } from '../../../abilities/abilityUses';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import type { DamageTakenEvent } from '../../../game/EventBus';
import { FIXED_DT } from '../../../game/gameConstants';
import type { GameEngine } from '../../../game/GameEngine';
import { peekPetState } from '../../../game/units/components/petComponent';
import { getLivingPetsOfUnit } from '../../../game/units/petHelpers';
import { spawnPetForOwner } from '../../../game/units/petSpawn';
import type { Unit } from '../../../game/units/Unit';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { hasUnitTag, UnitTag } from '../../../game/units/unitTag';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import {
    DISPLACEMENT_STRIKE_CLONE_COUNT,
    DISPLACEMENT_STRIKE_CLONE_RADIUS,
    DISPLACEMENT_STRIKE_CLONE_SECONDS,
    DISPLACEMENT_STRIKE_DAMAGE,
    DISPLACEMENT_STRIKE_PET_ABILITY_ID,
    DISPLACEMENT_STRIKE_SPLIT_SECONDS,
} from './0716Ability';

function step(engine: GameEngine, seconds: number): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
    }
}

/** Owner at (200, 200), its spirit at (380, 200) and a dummy at (450, 200), beyond the spirit's guard range. */
function battle() {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    const spirit = spawnPetForOwner(engine, player, {
        petDefId: 'dog',
        at: { x: 380, y: 200 },
        abilityIds: ['0701', '0702', '0710', '0711', DISPLACEMENT_STRIKE_PET_ABILITY_ID],
        maxHp: 30,
        spawnSource: 'abilitySpawn',
    })!;
    const dummy = placeTargetDummy(engine, { x: 450, y: 200 }, 'dummy');
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player, spirit, dummy };
}

function clonesOf(owner: Unit, engine: GameEngine): Unit[] {
    return getLivingPetsOfUnit(owner, engine.units).filter((u) => hasUnitTag(u, UnitTag.Clone));
}

function cast(engine: GameEngine, spirit: Unit, dummy: Unit): void {
    grantRecoveryChargeToAbility(spirit, DISPLACEMENT_STRIKE_PET_ABILITY_ID, 'commandCharge', 1);
    executeUnitAbility(spirit, getAbility(DISPLACEMENT_STRIKE_PET_ABILITY_ID)!, [{ type: 'unit', unitId: dummy.id }], engine);
}

describe('Displacement Strike (0716)', () => {
    it('spawns clones of the owner round the target; the spirit and every clone strike it', () => {
        const { engine, player, spirit, dummy } = battle();
        const hits: DamageTakenEvent[] = [];
        engine.eventBus.on('damage_taken', (e: DamageTakenEvent) => {
            if (e.unitId === dummy.id) hits.push(e);
        });

        cast(engine, spirit, dummy);
        step(engine, DISPLACEMENT_STRIKE_SPLIT_SECONDS + 0.6);

        const clones = clonesOf(player, engine);
        expect(clones).toHaveLength(DISPLACEMENT_STRIKE_CLONE_COUNT);
        for (const clone of clones) {
            expect(peekPetState(clone)?.ownerUnitId).toBe(player.id);
            expect(clone.abilities).not.toContain(DISPLACEMENT_STRIKE_PET_ABILITY_ID);
            expect(clone.ephemeralExpiryPolicy).toBe('finishCast');
        }
        // They appeared near the target (and may have dashed a little since).
        expect(
            clones.some((c) => Math.hypot(c.x - dummy.x, c.y - dummy.y) <= DISPLACEMENT_STRIKE_CLONE_RADIUS + 60),
        ).toBe(true);

        const spiritDamage = hits.filter((h) => h.sourceUnitId === spirit.id).reduce((s, h) => s + h.amount, 0);
        expect(spiritDamage).toBe(DISPLACEMENT_STRIKE_DAMAGE);
        for (const clone of clones) {
            expect(hits.some((h) => h.sourceUnitId === clone.id)).toBe(true);
        }
    });

    it('a recast replaces the earlier clones', () => {
        const { engine, player, spirit, dummy } = battle();
        cast(engine, spirit, dummy);
        step(engine, 1.0);
        const first = clonesOf(player, engine).map((c) => c.id);
        expect(first).toHaveLength(DISPLACEMENT_STRIKE_CLONE_COUNT);

        cast(engine, spirit, dummy);
        step(engine, DISPLACEMENT_STRIKE_SPLIT_SECONDS + 0.2);
        const now = clonesOf(player, engine);
        expect(now).toHaveLength(DISPLACEMENT_STRIKE_CLONE_COUNT);
        expect(now.some((c) => first.includes(c.id))).toBe(false);
    });

    it('clones are gone after their lifetime; the real spirit stays', () => {
        const { engine, player, spirit, dummy } = battle();
        cast(engine, spirit, dummy);
        step(engine, DISPLACEMENT_STRIKE_SPLIT_SECONDS + 0.1);
        expect(clonesOf(player, engine)).toHaveLength(DISPLACEMENT_STRIKE_CLONE_COUNT);

        step(engine, DISPLACEMENT_STRIKE_CLONE_SECONDS + 0.5);
        expect(clonesOf(player, engine)).toHaveLength(0);
        expect(spirit.isAlive()).toBe(true);
        expect(getLivingPetsOfUnit(player, engine.units)).toEqual([spirit]);
    });
});
