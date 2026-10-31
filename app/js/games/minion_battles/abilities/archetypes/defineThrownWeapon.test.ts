import { beforeAll, describe, expect, it } from 'vitest';
// AbilityRegistry first: importing archetypes directly hits an existing archetype <-> card-def import cycle.
import { registerAbilityForTest } from '../AbilityRegistry';
import { AbilityState } from '../Ability';
import { defineAbility } from '../defineAbility';
import { defineConjure } from './defineConjure';
import { defineThrownWeapon } from './defineThrownWeapon';
import { getConjuredWeaponDefByTokenKind, registerConjuredWeapon } from '../../game/conjuredWeapons/registry';
import { WEAPON_ORBIT_EFFECT_TYPE } from '../../game/effect_defs/weaponEffects';
import { FIXED_DT } from '../../game/gameConstants';
import type { GameEngine } from '../../game/GameEngine';
import type { Projectile } from '../../game/projectiles/Projectile';
import type { ResolvedTarget } from '../../game/types';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import { ensureAbilityRuntimeState } from '../abilityUses';
import { getThemeById } from '../../themes/abilityTheme';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';

// Group 05 (Earth): a primary-only theme, so the trail default is the Earth primary.
const CONJURE_ID = '0590';
const THROW_ID = '0591';
const HELD_ID = '0592';
const WEAPON_ID = 'test_javelin_weapon';
const TOKEN_KIND = 'test_javelin';
const ART_URL = '/test/javelin.svg';
const DAMAGE = 9;
const CONJURE_DURATION = 0.5;
const MOVE_MULT = 0.25;
const WINDUP_END = 0.2;
const ACTIVE_END = 0.3;
const COOLDOWN_END = 0.6;
const ORBIT_COUNT = 2;

const ConjureJavelin = defineConjure({
    id: CONJURE_ID,
    name: 'Conjure Javelin',
    image: '',
    weaponId: WEAPON_ID,
    maxUses: 1,
    duration: CONJURE_DURATION,
    moveMult: MOVE_MULT,
    orbit: { count: ORBIT_COUNT },
    getTooltipText: () => [],
});

const ThrowJavelin = defineThrownWeapon({
    id: THROW_ID,
    name: 'Throw Javelin',
    image: '',
    weaponId: WEAPON_ID,
    damage: DAMAGE,
    windupEnd: WINDUP_END,
    activeEnd: ACTIVE_END,
    cooldownEnd: COOLDOWN_END,
    aimLabel: 'Javelin aim',
    sprite: { sprite: { fps: 8, scale: 0.3, frameFiles: [ART_URL] }, trail: { effectType: 'BulletTrail' } },
    trail: { radius: 4, taper: true },
    getTooltipText: () => [],
});

const JavelinJab = defineAbility({
    id: HELD_ID,
    name: 'Javelin Jab',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: 0,
    targets: [],
    abilityTimings: [],
    getRange: () => ({ minRange: 0, maxRange: 0 }),
    getTooltipText: () => [],
});

const PLAYER = { x: 200, y: 200 };
const AIM_POINT = { x: PLAYER.x + 80, y: PLAYER.y };
const AIM: ResolvedTarget = { type: 'pixel', position: AIM_POINT };

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    const ticks = Math.ceil(seconds / FIXED_DT) + 1;
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

function javelinBattle() {
    const engine = buildTinyBattleEngine({ gridW: 20, gridH: 20, localPlayerId: TINY_BATTLE_PLAYER_ID });
    const { player } = placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.BasicCore],
    });
    player.abilities.push(CONJURE_ID);
    ensureAbilityRuntimeState(player, CONJURE_ID);
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, player };
}

describe('defineConjure + defineThrownWeapon (non-Armory weapon)', () => {
    beforeAll(() => {
        registerConjuredWeapon({
            id: WEAPON_ID,
            conjureAbilityId: CONJURE_ID,
            heldAbilityId: HELD_ID,
            releaseAbilityId: THROW_ID,
            tokenKind: TOKEN_KIND,
            heldUses: 1,
            art: { url: ART_URL },
        });
        registerAbilityForTest(ConjureJavelin);
        registerAbilityForTest(ThrowJavelin);
        registerAbilityForTest(JavelinJab);
    });

    it('builds the conjure window and throw timings from config', () => {
        expect(ConjureJavelin.prefireTime).toBe(CONJURE_DURATION);
        expect(ConjureJavelin.getAbilityStates(0)).toEqual([
            { state: AbilityState.MOVEMENT_PENALTY, data: { amount: MOVE_MULT } },
        ]);
        expect(ConjureJavelin.getAbilityStates(CONJURE_DURATION)).toEqual([]);
        expect(ThrowJavelin.prefireTime).toBe(WINDUP_END);
        expect(ThrowJavelin.abilityTimings.map((t) => ('id' in t ? t.id : null))).toEqual(['windup', 'throw', 'cooldown']);
        expect(ThrowJavelin.aiSettings?.maxRange).toBeGreaterThan(0);
    });

    it('equips, throws at a dummy for its damage, and leaves its own token', () => {
        const { engine, player } = javelinBattle();
        const dummy = placeTargetDummy(engine, AIM_POINT);

        executeUnitAbility(player, ConjureJavelin, [], engine);
        const orbit = engine.state.effectManager.effects.find((e) => e.effectType === WEAPON_ORBIT_EFFECT_TYPE);
        expect(orbit?.effectData?.weaponKind).toBe(TOKEN_KIND);
        expect(orbit?.effectData?.count).toBe(ORBIT_COUNT);
        expect(orbit?.duration).toBe(CONJURE_DURATION);
        step(engine, CONJURE_DURATION + FIXED_DT);
        expect(player.heldConjuredWeapon?.defId).toBe(WEAPON_ID);
        expect(player.abilities).toContain(THROW_ID);

        executeUnitAbility(player, ThrowJavelin, [AIM], engine);
        let thrown: Projectile | null = null;
        step(engine, COOLDOWN_END + 0.6, () => {
            for (const projectile of engine.projectiles) {
                if (projectile.sourceAbilityId === THROW_ID) thrown = projectile;
            }
        });
        const shot = thrown as Projectile | null;
        expect(shot).not.toBeNull();
        expect(shot!.trailColor).toBe(getThemeById('earth').primaryNum);
        expect(shot!.trailTaper).toBe(true);

        expect(dummy.maxHp - dummy.hp).toBe(DAMAGE);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(player.abilities).toContain(CONJURE_ID);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        expect(dropped.kind).toBe(TOKEN_KIND);
        expect(dropped.abilityId).toBe(THROW_ID);
        expect(getConjuredWeaponDefByTokenKind(dropped.kind)?.art.url).toBe(ART_URL);
    });
});
