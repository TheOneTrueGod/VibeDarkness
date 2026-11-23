import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility } from '../../../abilities/AbilityRegistry';
import { ensureAbilityRuntimeState } from '../../../abilities/abilityUses';
import { AbilityPhase, normalizeAbilityTimingsToIntervals } from '../../../abilities/abilityTimings';
import { FIXED_DT } from '../../../game/gameConstants';
import type { GameEngine } from '../../../game/GameEngine';
import { SPIRIT_SLASH_EFFECT_TYPE } from '../../../game/effects/slashTrail';
import { Unit } from '../../../game/units/Unit';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import { DogBiteAbility } from './0701Ability';

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

/** A biter at (200, 200) and a dummy 40 px east of it. */
function battle(damageFlat = 0) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    player.abilities.push(DogBiteAbility.id);
    ensureAbilityRuntimeState(player, DogBiteAbility.id);
    if (damageFlat) player.abilityModifiers = { [DogBiteAbility.id]: { damageFlat } };
    const dummy = placeTargetDummy(engine, { x: 240, y: 200 }, 'dummy');
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player, dummy };
}

function bite(engine: GameEngine, biter: Unit, target: Unit): void {
    executeUnitAbility(biter, getAbility(DogBiteAbility.id)!, [{ type: 'unit', unitId: target.id }], engine);
}

describe('Dog Bite 0701', () => {
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

        expect(DogBiteAbility.getDamage?.(pet)).toBe(5); // base 1 + flat 4
        expect(DogBiteAbility.getDamage?.(undefined)).toBe(1);
    });

    it('fires instantly: no windup, the strike starts as the cast begins', () => {
        const intervals = normalizeAbilityTimingsToIntervals(DogBiteAbility.abilityTimings!);
        expect(DogBiteAbility.prefireTime).toBe(0);
        expect(intervals.some((t) => t.abilityPhase === AbilityPhase.Windup)).toBe(false);
        expect(intervals[0]!.abilityPhase).toBe(AbilityPhase.Active);
        expect(intervals[0]!.start).toBe(0);
    });

    it('dashes straight through the target, leaving a slash, and hits it as it passes', () => {
        const { engine, player, dummy } = battle();
        const startHp = dummy.hp;
        bite(engine, player, dummy);

        // First tick: the dash has started on the biter's side of the target and left one slash.
        step(engine, FIXED_DT);
        expect(player.x).toBeLessThan(dummy.x);
        expect(engine.effects.filter((e) => e.effectType === SPIRIT_SLASH_EFFECT_TYPE)).toHaveLength(1);

        let hitWhileBehind = false;
        step(engine, 0.3, () => {
            if (dummy.hp < startHp && player.x < dummy.x) hitWhileBehind = true;
        });

        expect(dummy.hp).toBe(startHp - 1);
        // It ends on the far side of the target, in line with it, and took damage only once it got there.
        expect(player.x).toBeGreaterThan(dummy.x + dummy.radius);
        expect(player.y).toBeCloseTo(dummy.y, 0);
        expect(hitWhileBehind).toBe(false);
    });

    it('deals research damageFlat on the hit', () => {
        const { engine, player, dummy } = battle(3);
        const startHp = dummy.hp;
        bite(engine, player, dummy);
        step(engine, 0.3);
        expect(dummy.hp).toBe(startHp - 4);
    });
});
