import { describe, expect, it } from 'vitest';
import { FIXED_DT, ROUND_DURATION } from '../../game/gameConstants';
import { GameEngine } from '../../game/GameEngine';
import type { ResolvedTarget } from '../../game/types';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import { getUnitEffectiveSpeed } from '../../game/units/unitAbilityQueries';
import '../../abilities/AbilityRegistry';
import { CORE_ITEM_IDS } from '../../character_defs/items';
import { swordItem } from '../../character_defs/items/weapons/013_sword';
import {
    buildTinyBattleEngine,
    placePlayerFromLoadout,
    placeTargetDummy,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { ARMORY_NODE_CORE, ARMORY_TREE_ID } from '../../../../researchTrees/trees/armory';
import { listTier10RootCoreCandidates } from '../../storylines/WorldOfDarkness/missions/006_core_awakening';
import {
    CHARGE_MISSION_START,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
    DEPLOY_TURRET_ABILITY_ID,
    DROPPED_WEAPON_ARC_DISTANCE,
    IMPROVISED_SWORD_ABILITY_ID,
    IMPROVISED_SWORD_COOLDOWN_END,
    IMPROVISED_SWORD_MAX_USES,
    THROW_SWORD_ABILITY_ID,
    THROW_SWORD_COOLDOWN_END,
    IMPROVISED_SWORD_DAMAGE,
    TURRET_FIRST_SHOT_DELAY,
    TURRET_LIFETIME,
    TURRET_SHOT_COUNT,
    WEAPON_DISCARD_ARC_EFFECT_TYPE,
} from './armoryConstants';
import { CreateSwordAbility } from './1001_CreateSword/1001Ability';
import { IMPROVISED_SWORD_IMPACT_TIME, ImprovisedSwordAbility } from './1002_ImprovisedSword/1002Ability';
import { ThrowSwordAbility } from './1003_ThrowSword/1003Ability';
import { SWING_SWORD_DAMAGE } from '../0112_SwingSword/0112Ability';
import { THROW_RANGE } from '../throwNumbers';
import swordProjectileUrl from '../../character_defs/items/assets/013_sword.svg';
import type { Unit } from '../../game/units/Unit';

const PLAYER = { x: 200, y: 200 };
const AIM_POINT = { x: PLAYER.x + 80, y: PLAYER.y };
const AIM: ResolvedTarget = { type: 'pixel', position: AIM_POINT };

function stepTicks(engine: GameEngine, ticks: number, onTick?: () => void): void {
    for (let i = 0; i < ticks; i++) {
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

function step(engine: GameEngine, seconds: number, onTick?: () => void): void {
    const ticks = Math.ceil(seconds / FIXED_DT) + 1;
    for (let i = 0; i < ticks; i++) {
        // Idle player units pause the sim. Clear that so timers (turret shots, projectile flight) advance.
        engine.waitingForOrders = null;
        (engine as unknown as { fixedUpdate(dt: number): void }).fixedUpdate(FIXED_DT);
        onTick?.();
    }
}

/** Projectiles despawn at max range, so count ids as they appear instead of reading the list at the end. */
function countSpawnedProjectiles(engine: GameEngine, seconds: number, onTick?: () => void): number {
    const seen = new Set(engine.projectiles.map((projectile) => projectile.id));
    let spawned = 0;
    step(engine, seconds, () => {
        for (const projectile of engine.projectiles) {
            if (seen.has(projectile.id)) continue;
            seen.add(projectile.id);
            spawned += 1;
        }
        onTick?.();
    });
    return spawned;
}

function armoryBattle(): { engine: GameEngine; playerId: string } {
    const engine = buildTinyBattleEngine({
        gridW: 20,
        gridH: 20,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
    });
    placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
        researchTrees: { [ARMORY_TREE_ID]: [ARMORY_NODE_CORE] },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine, playerId: TINY_BATTLE_PLAYER_ID };
}

describe('Armory Core', () => {
    it('is offered in Core Awakening', () => {
        expect(listTier10RootCoreCandidates().some((candidate) => candidate.treeId === ARMORY_TREE_ID)).toBe(true);
    });

    it('grants Charge, Create Sword, Deploy Turret, and remembers the sword as the weapon', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        expect(player.getResource('charge')?.current).toBe(CHARGE_MISSION_START);
        expect(player.abilities).toContain(CREATE_SWORD_ABILITY_ID);
        expect(player.abilities).toContain(DEPLOY_TURRET_ABILITY_ID);
        expect(player.weaponAbilityIds).toContain(swordItem.cardsToAdd[0]);
        expect(IMPROVISED_SWORD_DAMAGE).toBeGreaterThan(SWING_SWORD_DAMAGE);
    });

    it('walks at a penalty while the swords are forming', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateSwordAbility, [], engine);
        expect(getUnitEffectiveSpeed(player, engine.gameTime)).toBeCloseTo(player.speed * CREATE_SWORD_MOVE_MULT);
        player.setMovement([{ col: 9, row: 5 }], undefined, engine.gameTick);
        const originX = player.x;
        const ticks = 12;
        stepTicks(engine, ticks);
        const traveled = player.x - originX;
        const fullSpeedDistance = player.speed * ticks * FIXED_DT;
        expect(traveled).toBeGreaterThan(0);
        expect(traveled).toBeLessThan(fullSpeedDistance);
    });

    it('replaces weapon abilities while the sword is held, then drops a token that does not expire', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateSwordAbility, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        expect(player.heldConjuredWeapon).not.toBeNull();
        expect(player.abilities).toContain(IMPROVISED_SWORD_ABILITY_ID);
        expect(player.abilities).toContain(THROW_SWORD_ABILITY_ID);
        expect(player.abilityRuntime[swordItem.cardsToAdd[0]!]?.active).toBe(false);
        expect(player.abilityRuntime[IMPROVISED_SWORD_ABILITY_ID]?.currentUses).toBe(IMPROVISED_SWORD_MAX_USES);

        executeUnitAbility(player, ImprovisedSwordAbility, [AIM], engine);
        step(engine, IMPROVISED_SWORD_COOLDOWN_END + FIXED_DT);
        expect(player.heldConjuredWeapon).not.toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(0);

        engine.waitingForOrders = null;
        executeUnitAbility(player, ImprovisedSwordAbility, [AIM], engine);
        const ticksBeforeImpact = Math.floor(IMPROVISED_SWORD_IMPACT_TIME / FIXED_DT);
        stepTicks(engine, ticksBeforeImpact);
        expect(player.heldConjuredWeapon).not.toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(0);
        stepTicks(engine, 2);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(player.abilities).not.toContain(IMPROVISED_SWORD_ABILITY_ID);
        expect(player.abilityRuntime[swordItem.cardsToAdd[0]!]?.active).not.toBe(false);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const toss = engine.state.effectManager.effects.find(
            (effect) => effect.effectType === WEAPON_DISCARD_ARC_EFFECT_TYPE,
        );
        expect(toss?.pauseBehaviour).toBe('continue');
        expect(toss?.active).toBe(true);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        const travel = Math.hypot(dropped.x - player.x, dropped.y - player.y);
        expect(travel).toBeCloseTo(DROPPED_WEAPON_ARC_DISTANCE, 0);

        const keptId = dropped.id;
        step(engine, ROUND_DURATION * 3);
        expect(engine.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id)).toContain(keptId);

        const saved = engine.toJSON();
        const restored = GameEngine.fromJSON(saved, TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        expect(restored.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id)).toEqual([keptId]);
        expect(restored.state.fieldObjects.droppedWeapons[0]?.facing).toBe(dropped.facing);
    });

    it('leaves a token where the thrown sword stops, and not while it is still in the air', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateSwordAbility, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        engine.waitingForOrders = null;
        executeUnitAbility(player, ThrowSwordAbility, [AIM], engine);
        let droppedWhileFlying: number | null = null;
        let threwSwordSprite = false;
        const spawned = countSpawnedProjectiles(engine, THROW_SWORD_COOLDOWN_END + FIXED_DT, () => {
            for (const projectile of engine.projectiles) {
                if (projectile.sourceAbilityId !== THROW_SWORD_ABILITY_ID) continue;
                if (droppedWhileFlying == null) droppedWhileFlying = engine.state.fieldObjects.droppedWeapons.length;
                const frames = projectile.spriteConfig?.sprite;
                threwSwordSprite = projectile.projectileType === 'sprite_projectile'
                    && frames != null
                    && 'frameFiles' in frames
                    && frames.frameFiles[0] === swordProjectileUrl;
            }
        });
        expect(spawned).toBe(1);
        expect(droppedWhileFlying).toBe(0);
        expect(threwSwordSprite).toBe(true);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        expect(dropped.x).toBeGreaterThan(player.x + THROW_RANGE);
        expect(player.abilities).toContain(CREATE_SWORD_ABILITY_ID);
        expect(player.abilityRuntime[CREATE_SWORD_ABILITY_ID]?.active).not.toBe(false);
    });

    it('leaves a token when the thrown sword hits', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        placeTargetDummy(engine, AIM_POINT);
        executeUnitAbility(player, CreateSwordAbility, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        engine.waitingForOrders = null;
        executeUnitAbility(player, ThrowSwordAbility, [AIM], engine);
        step(engine, THROW_SWORD_COOLDOWN_END + FIXED_DT);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        expect(dropped.x).toBeGreaterThan(player.x);
        expect(dropped.x).toBeLessThan(player.x + THROW_RANGE);
        expect(player.heldConjuredWeapon).toBeNull();
    });

    it('fires turret shots down the cone, spends an empty cone, and then removes the sentry', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        placeTargetDummy(engine, { x: PLAYER.x + 100, y: PLAYER.y });
        placeTargetDummy(engine, { x: PLAYER.x, y: PLAYER.y + 160 }, 'wide');
        engine.state.fieldObjects.spawnSentry(engine, {
            x: PLAYER.x,
            y: PLAYER.y,
            facing: 0,
            teamId: player.teamId,
            ownerUnitId: player.id,
            abilityId: DEPLOY_TURRET_ABILITY_ID,
        });
        const seen = new Set(engine.projectiles.map((projectile) => projectile.id));
        let firstShot: { velocityX: number; velocityY: number } | null = null;
        step(engine, TURRET_FIRST_SHOT_DELAY + FIXED_DT, () => {
            for (const projectile of engine.projectiles) {
                if (seen.has(projectile.id) || firstShot) continue;
                seen.add(projectile.id);
                firstShot = projectile;
            }
        });
        expect(firstShot).not.toBeNull();
        expect(Math.abs(firstShot!.velocityX)).toBeGreaterThan(Math.abs(firstShot!.velocityY));
        expect(engine.state.fieldObjects.sentries[0]?.shotsRemaining).toBe(TURRET_SHOT_COUNT - 1);

        const empty = buildTinyBattleEngine({
            gridW: 12,
            gridH: 12,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
        });
        const placed = placePlayerFromLoadout(empty, {
            playerId: TINY_BATTLE_PLAYER_ID,
            world: PLAYER,
            equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
            researchTrees: { [ARMORY_TREE_ID]: [ARMORY_NODE_CORE] },
        });
        empty.state.fieldObjects.spawnSentry(empty, {
            x: PLAYER.x,
            y: PLAYER.y,
            facing: 0,
            teamId: placed.player.teamId,
            ownerUnitId: placed.player.id,
            abilityId: DEPLOY_TURRET_ABILITY_ID,
        });
        const emptySeen = new Set(empty.projectiles.map((projectile) => projectile.id));
        let spawned = 0;
        let facingShot: { velocityX: number; velocityY: number } | null = null;
        step(empty, TURRET_LIFETIME + FIXED_DT, () => {
            for (const projectile of empty.projectiles) {
                if (emptySeen.has(projectile.id)) continue;
                emptySeen.add(projectile.id);
                spawned += 1;
                facingShot ??= projectile;
            }
        });
        expect(spawned).toBe(TURRET_SHOT_COUNT);
        expect(facingShot).not.toBeNull();
        expect(facingShot!.velocityX).toBeGreaterThan(Math.abs(facingShot!.velocityY));
        expect(empty.state.fieldObjects.sentries).toHaveLength(0);
    });

    it('draws a throw line clamped to throw range', () => {
        const lines: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
        let cursor = { x: 0, y: 0 };
        const gr = {
            clear(): void {},
            moveTo(x: number, y: number): void { cursor = { x, y }; },
            lineTo(x: number, y: number): void { lines.push({ x0: cursor.x, y0: cursor.y, x1: x, y1: y }); },
            circle(): void {},
            fill(): void {},
            stroke(): void {},
        };
        const caster = { x: 10, y: 20 } as Unit;
        ThrowSwordAbility.renderTargetingPreviewSelectedTargets!(
            gr,
            caster,
            [],
            { x: caster.x + THROW_RANGE * 2, y: caster.y },
            [],
        );
        expect(lines).toEqual([{ x0: caster.x, y0: caster.y, x1: caster.x + THROW_RANGE, y1: caster.y }]);
    });
});
