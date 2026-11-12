/**
 * A pounce that hits nothing still flurries where it lands: each Spirit Flurry strike goes through the enemy
 * nearest the landing point (one per strike), and a flurry with nobody nearby hits nothing.
 */
import { describe, expect, it } from 'vitest';
// AbilityRegistry first (avoids the CastBehaviours import cycle).
import { getAbility } from '../../../abilities/AbilityRegistry';
import { ensureAbilityRuntimeState } from '../../../abilities/abilityUses';
import { FIXED_DT } from '../../../game/gameConstants';
import type { GameEngine } from '../../../game/GameEngine';
import type { ResolvedTarget } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { executeUnitAbility } from '../../../game/units/unitAbilityLifecycle';
import { CORE_ITEM_IDS } from '../../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../../testing/harness/buildTinyBattleEngine';
import { SPIRIT_FLURRY_ABILITY_ID, SPIRIT_FLURRY_ANGLES } from '../0711_SpiritFlurry/0711Ability';
import { SPIRIT_STRIKE_DAMAGE } from '../0710_SpiritStrike/0710Ability';
import { PounceAbility } from './0702Ability';

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    for (let i = 0; i < Math.ceil(seconds / FIXED_DT); i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

function battle(dummies: { x: number; y: number }[]) {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: { x: 200, y: 200 },
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    for (const id of [PounceAbility.id, SPIRIT_FLURRY_ABILITY_ID]) {
        player.abilities.push(id);
        ensureAbilityRuntimeState(player, id);
    }
    const targets = dummies.map((at, i) => placeTargetDummy(engine, at, `dummy${i}`));
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player, targets };
}

/** Pounce at a spot (no enemy on the way) and count, per tick, how many dummies lost hp. */
function pounceAndWatch(engine: GameEngine, player: Unit, targets: Unit[]) {
    const aim: ResolvedTarget = { type: 'pixel', position: { x: 300, y: 200 } };
    executeUnitAbility(player, getAbility(PounceAbility.id)!, [aim], engine);
    let hp = targets.map((t) => t.hp);
    const hitsPerTick: number[] = [];
    let flurried = false;
    step(engine, 2.0, () => {
        if (player.activeAbilities.some((a) => a.abilityId === SPIRIT_FLURRY_ABILITY_ID)) flurried = true;
        const now = targets.map((t) => t.hp);
        hitsPerTick.push(now.filter((h, i) => h < hp[i]!).length);
        hp = now;
    });
    return { hitsPerTick: hitsPerTick.filter((n) => n > 0), flurried };
}

describe('Pounce whiff → Spirit Flurry on the landing spot', () => {
    it('strikes the enemies near where it landed, one per strike', () => {
        // Off the pounce line (y = 200), close to where it lands (300, 200).
        const { engine, player, targets } = battle([{ x: 300, y: 245 }, { x: 300, y: 155 }]);
        const before = targets.map((t) => t.hp);
        const { hitsPerTick, flurried } = pounceAndWatch(engine, player, targets);

        expect(flurried).toBe(true);
        expect(hitsPerTick).toHaveLength(SPIRIT_FLURRY_ANGLES.length);
        expect(hitsPerTick.every((n) => n === 1)).toBe(true);
        const dealt = targets.reduce((sum, t, i) => sum + (before[i]! - t.hp), 0);
        expect(dealt).toBe(SPIRIT_FLURRY_ANGLES.length * SPIRIT_STRIKE_DAMAGE);
    });

    it('still flurries with nobody nearby, hitting nothing', () => {
        const { engine, player, targets } = battle([{ x: 600, y: 600 }]);
        const { hitsPerTick, flurried } = pounceAndWatch(engine, player, targets);
        expect(flurried).toBe(true);
        expect(hitsPerTick).toEqual([]);
    });
});
