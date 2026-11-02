import { beforeAll, describe, expect, it } from 'vitest';
import { isAbilityTimingInterval } from '../../abilities/abilityTimings';
import { pointInCone } from '../../abilities/coneGeometry';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import { isSelectTargetDef } from '../../abilities/timingTargetDef';
import { findPreviewDeferredSelectLabel } from '../../game/interaction/selectTargetLookahead';
import { resolveItsSelectTargetForClick } from '../../game/interaction/itsCanvasInput';
import { FIXED_DT, ROUND_DURATION } from '../../game/gameConstants';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainType } from '../../terrain/TerrainType';
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
import {
    ARMORY_NODE_CORE,
    ARMORY_NODE_CREATE_MACE,
    ARMORY_NODE_CREATE_SHIELD,
    ARMORY_TREE_ID,
    armoryTree,
} from '../../../../researchTrees/trees/armory';
import { listTier10RootCoreCandidates } from '../../storylines/WorldOfDarkness/missions/006_core_awakening';
import {
    ARMORY_CREATE_CHARGE_COST,
    ARMORY_ECHO_CHARGE_COST,
    ARMORY_CREATE_MAX_USES,
    ARMORY_MACE_WEAPON_ID,
    ARMORY_PRIMARY_COLOR,
    ARMORY_PRIMARY_COLOR_NUM,
    ARMORY_SECONDARY_COLOR_NUM,
    ARMORY_PRIMARY_SHADE_COLOR,
    ARMORY_SECONDARY_COLOR,
    ARMORY_SHIELD_WEAPON_ID,
    ARMORY_TURRET_DEF_ID,
    CHARGE_MACE_ABILITY_ID,
    CHARGE_MACE_MAX_USES,
    CREATE_MACE_ABILITY_ID,
    CREATE_SHIELD_ABILITY_ID,
    CREATE_SWORD_ABILITY_ID,
    CREATE_SWORD_CAST_DURATION,
    CREATE_SWORD_MOVE_MULT,
    DEPLOY_TURRET_ABILITY_ID,
    DROPPED_WEAPON_KIND_MACE,
    DROPPED_WEAPON_KIND_SHIELD,
    DROPPED_WEAPON_KIND_SWORD,
    IMPROVISED_SWORD_ABILITY_ID,
    IMPROVISED_SWORD_MAX_USES,
    RELEASE_CHARGE_ABILITY_ID,
    THROW_SHIELD_ABILITY_ID,
    THROW_SWORD_ABILITY_ID,
    WHIRL_ABILITY_ID,
} from './armoryConstants';
import { CREATE_SHIELD_CAST_DURATION, SHIELD_BLOCK_CHARGE_GRANT } from './1008_CreateShield/1008Constants';
import {
    THROW_SHIELD_BOUNCE_RANGE,
    THROW_SHIELD_COOLDOWN_END,
    THROW_SHIELD_DAMAGE,
    THROW_SHIELD_TRAIL_RADIUS,
} from './1010_ThrowShield/1010Constants';
import { CHARGE_MISSION_START } from '../../resources/Charge';
import { IMPROVISED_SWORD_COOLDOWN_END, IMPROVISED_SWORD_DAMAGE } from './1002_ImprovisedSword/1002Constants';
import { THROW_SWORD_COOLDOWN_END, THROW_SWORD_DAMAGE } from './1003_ThrowSword/1003Constants';
import { RELEASE_CHARGE_DAMAGE, RELEASE_CHARGE_ECHO_RADIUS } from './1009_ReleaseCharge/1009Constants';
import {
    TURRET_AIM_LABEL,
    TURRET_AIM_WINDOW_END,
    TURRET_CONE_HALF_ANGLE_RAD,
    TURRET_DEPLOY_SPEED,
    TURRET_DEPLOY_SPIN_DEGREES_PER_SEC,
    TURRET_FIRST_SHOT_DELAY,
    TURRET_FLIGHT_DURATION,
    TURRET_LIFETIME,
    TURRET_PLACE_LABEL,
    TURRET_PLACE_RANGE,
    TURRET_SHOT_COUNT,
    TURRET_SHOT_HIT_RADIUS,
    TURRET_SHOT_RANGE,
    TURRET_SHOT_SPRITE_SCALE,
} from './1004_DeployTurret/1004Constants';
import {
    MACE_WHIRL_INNER_CLEARANCE,
    MACE_WHIRL_MAX_TARGETS,
    MACE_WHIRL_OUTER_RADIUS,
    MACE_WHIRL_SEGMENT_LIFETIME,
    MACE_WHIRL_SEGMENTS,
    WHIRL_DAMAGE,
} from './1007_Whirl/1007Constants';
import { WEAPON_DISCARD_ARC_EFFECT_TYPE } from '../../game/effect_defs/weaponEffects';
import { ARC_SEGMENT_EFFECT_TYPE } from '../../game/effect_defs/arcSegmentEffects';
import { TURRET_BODY_RADIUS, TURRET_OPEN_DURATION } from '../../game/effect_defs/turretDeployPose';
import { DEPLOYABLE_DELIVERY_PROJECTILE_TYPE } from '../../game/fieldObjects/deployableDefs';
import { CreateSwordAbility } from './1001_CreateSword/1001Ability';
import { IMPROVISED_SWORD_IMPACT_TIME, ImprovisedSwordAbility } from './1002_ImprovisedSword/1002Ability';
import { ThrowSwordAbility } from './1003_ThrowSword/1003Ability';
import { DeployTurretAbility, validateTurretPlacement } from './1004_DeployTurret/1004Ability';
import { CreateMaceAbility_1005 } from './1005_CreateMace/1005Ability';
import { CHARGE_MACE_IMPACT_TIME, ChargeMaceAbility_1006 } from './1006_ChargeMace/1006Ability';
import { MACE_WHIRL_SWEEP_END, WHIRL_TARGET_LABEL, WhirlAbility_1007 } from './1007_Whirl/1007Ability';
import { CreateShieldAbility_1008 } from './1008_CreateShield/1008Ability';
import { ReleaseChargeAbility_1009 } from './1009_ReleaseCharge/1009Ability';
import { ThrowShieldAbility_1010 } from './1010_ThrowShield/1010Ability';
import { CONE_OF_LIGHT_ACTIVE_END, CONE_OF_LIGHT_COOLDOWN_END } from '../0121_ConeOfLight/0121Ability';
import { Projectile } from '../../game/projectiles/Projectile';
import { DROPPED_WEAPON_ARC_DISTANCE } from '../../game/fieldObjects/landing';
import { DEFAULT_BULLET_TRAIL_RADIUS } from '../../game/effect_defs/bulletTrail';
import shieldSvg from './shield.svg?raw';
import shieldThrowSvg from './shieldThrow.svg?raw';
import shieldProjectileUrl from './shield.svg';
import { SWING_SWORD_DAMAGE, SWING_SWORD_HITBOX, SWING_SWORD_LUNGE } from '../0112_SwingSword/0112Ability';
import { SWING_BAT_HITBOX, SWING_BAT_WINDUP_END } from '../0115_SwingBat/0115Ability';
import { THROW_RANGE } from '../throwNumbers';
import chargeSwordThrowSvg from './chargeSwordThrow.svg?raw';
import whirlSvg from './1007_Whirl/whirl.svg?raw';
import swordProjectileUrl from './chargeSword.svg';
import type { Unit } from '../../game/units/Unit';
import { registerArmoryContent } from './register';

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

function placeSelect() {
    const entry = DeployTurretAbility.abilityTimings[0];
    if (!entry || !isAbilityTimingInterval(entry)) throw new Error('Deploy Turret place interval is missing');
    const def = entry.targetDef;
    if (!def || !isSelectTargetDef(def)) throw new Error('Deploy Turret place select is missing');
    return def;
}

function previewRecorder(): { gr: IAbilityPreviewGraphics; circles: Array<{ x: number; y: number; r: number }> } {
    const circles: Array<{ x: number; y: number; r: number }> = [];
    const gr: IAbilityPreviewGraphics = {
        clear(): void {},
        moveTo(): void {},
        lineTo(): void {},
        circle(x: number, y: number, r: number): void { circles.push({ x, y, r }); },
        fill(): void {},
        stroke(): void {},
    };
    return { gr, circles };
}

// Armory weapons and the turret sentry def are looked up at cast time.
beforeAll(() => registerArmoryContent());

describe('Armory Core', () => {
    it('is offered in Core Awakening', () => {
        expect(listTier10RootCoreCandidates().some((candidate) => candidate.treeId === ARMORY_TREE_ID)).toBe(true);
    });

    it('paints the quench pair and names the conjured slash Charge Sword', () => {
        expect(ARMORY_PRIMARY_COLOR).toBe('#4f6d8c');
        expect(ARMORY_SECONDARY_COLOR).toBe('#e7e5e4');
        expect(ARMORY_PRIMARY_SHADE_COLOR).toBe('#2b3c4d');
        expect(ImprovisedSwordAbility.name).toBe('Charge Sword');
        expect(ImprovisedSwordAbility.lunge?.distance).toBe(SWING_SWORD_LUNGE);
        expect(ImprovisedSwordAbility.aiSettings?.maxRange).toBe(SWING_SWORD_HITBOX.maxRange + SWING_SWORD_LUNGE);
        expect(SWING_SWORD_HITBOX.thickness).toBeLessThan(SWING_BAT_HITBOX.thickness);
        expect(CreateSwordAbility.image).toBe(ImprovisedSwordAbility.image);
        expect(ThrowSwordAbility.image).toBe(chargeSwordThrowSvg);
        expect(ThrowSwordAbility.image).not.toBe(ImprovisedSwordAbility.image);
    });

    it('grants Charge, Create Sword, Deploy Turret, and remembers the sword as the weapon', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        expect(player.getResource('charge')?.current).toBe(CHARGE_MISSION_START);
        expect(player.abilities).toContain(CREATE_SWORD_ABILITY_ID);
        expect(player.abilities).toContain(DEPLOY_TURRET_ABILITY_ID);
        expect(player.weaponAbilityIds).toContain(swordItem.cardsToAdd[0]);
        expect(IMPROVISED_SWORD_DAMAGE).toBeGreaterThanOrEqual(SWING_SWORD_DAMAGE);
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

    it('replaces weapon abilities while the sword is held, drops a token each slash, and the tokens do not expire', () => {
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
        // The first slash drops a token and keeps the sword in hand.
        expect(player.heldConjuredWeapon).not.toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);

        engine.waitingForOrders = null;
        executeUnitAbility(player, ImprovisedSwordAbility, [AIM], engine);
        const ticksBeforeImpact = Math.floor(IMPROVISED_SWORD_IMPACT_TIME / FIXED_DT);
        stepTicks(engine, ticksBeforeImpact);
        expect(player.heldConjuredWeapon).not.toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        stepTicks(engine, 2);
        // The last slash discards the sword: one more token, not two.
        expect(player.heldConjuredWeapon).toBeNull();
        expect(player.abilities).not.toContain(IMPROVISED_SWORD_ABILITY_ID);
        expect(player.abilityRuntime[swordItem.cardsToAdd[0]!]?.active).not.toBe(false);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(2);
        const toss = engine.state.effectManager.effects.filter(
            (effect) => effect.effectType === WEAPON_DISCARD_ARC_EFFECT_TYPE,
        ).at(-1);
        expect(toss?.pauseBehaviour).toBe('continue');
        expect(toss?.active).toBe(true);
        const dropped = engine.state.fieldObjects.droppedWeapons[1]!;
        const travel = Math.hypot(dropped.x - player.x, dropped.y - player.y);
        expect(travel).toBeCloseTo(DROPPED_WEAPON_ARC_DISTANCE, 0);

        const keptIds = engine.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id);
        step(engine, ROUND_DURATION * 3);
        expect(engine.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id)).toEqual(keptIds);

        const saved = engine.toJSON();
        const restored = GameEngine.fromJSON(saved, TINY_BATTLE_PLAYER_ID, engine.terrainManager);
        expect(restored.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id)).toEqual(keptIds);
        expect(restored.state.fieldObjects.droppedWeapons[1]?.facing).toBe(dropped.facing);
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

    it('keeps the place ring up and rejects ground outside it or on a blocked tile', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        const select = placeSelect();
        expect(select.clampPixelToRange).toBe(false);

        const outside = { x: player.x + TURRET_PLACE_RANGE + CELL_SIZE, y: player.y };
        expect(validateTurretPlacement({
            caster: player,
            engine,
            pick: { type: 'pixel', position: outside },
        })).toBe(false);

        const insideTiles = 2;
        const inside = { x: player.x + insideTiles * CELL_SIZE, y: player.y };
        expect(validateTurretPlacement({
            caster: player,
            engine,
            pick: { type: 'pixel', position: inside },
        })).toBe(true);
        const terrain = engine.terrainManager;
        if (!terrain) throw new Error('armory battle has no terrain');
        const blocked = terrain.grid.worldToGrid(inside.x, inside.y);
        terrain.grid.set(blocked.col, blocked.row, TerrainType.Impassable);
        expect(validateTurretPlacement({
            caster: player,
            engine,
            pick: { type: 'pixel', position: inside },
        })).toBe(false);

        const { gr, circles } = previewRecorder();
        const caster = { x: player.x, y: player.y };
        select.hitbox.renderInvalidPreview(gr, caster, outside);
        expect(circles).toEqual([{ x: player.x, y: player.y, r: TURRET_PLACE_RANGE }]);
        circles.length = 0;
        select.hitbox.renderTargetingPreview(gr, caster, inside, []);
        expect(circles).toEqual([
            { x: player.x, y: player.y, r: TURRET_PLACE_RANGE },
            { x: inside.x, y: inside.y, r: TURRET_BODY_RADIUS },
        ]);
    });

    it('flies a folded turret on the simulation clock and leaves the sentry when it arrives', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        const place = { x: player.x + TURRET_PLACE_RANGE, y: player.y };
        const aim = { x: place.x, y: place.y + CELL_SIZE };
        const facing = Math.atan2(aim.y - place.y, aim.x - place.x);
        executeUnitAbility(player, DeployTurretAbility, [
            { type: 'pixel', position: place },
            { type: 'pixel', position: aim },
        ], engine);
        const aimTiming = DeployTurretAbility.abilityTimings[1];
        if (!aimTiming || !isAbilityTimingInterval(aimTiming) || !aimTiming.targetDef || !isSelectTargetDef(aimTiming.targetDef)) {
            throw new Error('Deploy Turret facing select is missing');
        }
        expect(aimTiming.targetDef.chainImmediately).toBe(true);

        step(engine, TURRET_AIM_WINDOW_END);
        const delivery = engine.projectiles.find((projectile) => projectile.projectileType === DEPLOYABLE_DELIVERY_PROJECTILE_TYPE);
        expect(delivery).toBeDefined();
        expect(delivery!.passThroughEnemies).toBe(true);
        expect(delivery!.rotationSpeed).toBe(TURRET_DEPLOY_SPIN_DEGREES_PER_SEC);
        expect(delivery!.maxDistance).toBeCloseTo(TURRET_PLACE_RANGE);
        expect(delivery!.velocityX).toBeCloseTo(TURRET_DEPLOY_SPEED);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(0);

        step(engine, TURRET_FLIGHT_DURATION);
        expect(engine.projectiles.some((projectile) => projectile.projectileType === DEPLOYABLE_DELIVERY_PROJECTILE_TYPE)).toBe(false);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(1);
        const sentry = engine.state.fieldObjects.placedDeployables[0]!;
        expect(sentry.x).toBeCloseTo(place.x);
        expect(sentry.y).toBeCloseTo(place.y);
        expect(sentry.facing).toBeCloseTo(facing);
        expect(sentry.chargesRemaining).toBe(TURRET_SHOT_COUNT);

        step(engine, TURRET_OPEN_DURATION);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(1);
        expect(engine.state.fieldObjects.placedDeployables[0]!.chargesRemaining).toBe(TURRET_SHOT_COUNT);
    });

    it('spawns the sentry from a live order after the caster clock is already running', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        // Cast starts once local time has been stepped twice. The next addition rounds high
        // ((t + dt) - t > dt), so the place window's previous sample is a hair inside the window.
        const clockStepsBeforeOrder = 1;
        stepTicks(engine, clockStepsBeforeOrder);
        expect(player.localClockActive).toBe(true);
        expect(player.localTime).toBeGreaterThan(0);

        const place = { x: player.x + TURRET_PLACE_RANGE * 0.7, y: player.y - CELL_SIZE * 0.4 };
        const aim = { x: place.x + CELL_SIZE * 2, y: place.y - CELL_SIZE };
        const placeTarget: ResolvedTarget = { type: 'pixel', position: place };
        const aimTarget: ResolvedTarget = { type: 'pixel', position: aim };
        engine.state.orderMgr.queueOrder(engine.gameTick + 1, {
            unitId: player.id,
            abilityId: DEPLOY_TURRET_ABILITY_ID,
            targets: [placeTarget, aimTarget],
            targetsByLabel: {
                [TURRET_PLACE_LABEL]: { type: 'pixel', position: { x: place.x, y: place.y } },
                [TURRET_AIM_LABEL]: { type: 'pixel', position: { x: aim.x, y: aim.y } },
            },
            endTurn: true,
        });

        step(engine, TURRET_AIM_WINDOW_END + FIXED_DT);
        const active = player.activeAbilities.find((entry) => entry.abilityId === DEPLOY_TURRET_ABILITY_ID);
        const payload = active?.castPayload as { place?: { x: number; y: number }; aim?: { x: number; y: number } } | undefined;
        expect(payload?.place).toEqual(place);
        expect(payload?.aim).toEqual(aim);
        expect(engine.projectiles.some((projectile) => projectile.projectileType === DEPLOYABLE_DELIVERY_PROJECTILE_TYPE)).toBe(true);

        step(engine, TURRET_FLIGHT_DURATION);
        expect(engine.state.fieldObjects.placedDeployables).toHaveLength(1);
        expect(engine.state.fieldObjects.placedDeployables[0]!.x).toBeCloseTo(place.x);
        expect(engine.state.fieldObjects.placedDeployables[0]!.y).toBeCloseTo(place.y);
    });

    it('draws the turret footprint on the chosen tile while aiming', () => {
        const { gr, circles } = previewRecorder();
        const place = { x: PLAYER.x + CELL_SIZE, y: PLAYER.y };
        DeployTurretAbility.renderTargetingPreviewSelectedTargets!(
            gr,
            { x: PLAYER.x, y: PLAYER.y } as Unit,
            [{ type: 'pixel', position: place }],
            { x: place.x + CELL_SIZE, y: place.y },
            [],
        );
        expect(circles).toContainEqual({ x: place.x, y: place.y, r: TURRET_BODY_RADIUS });
    });

    it('fires at an enemy whose body is in the cone, spends an empty cone, and then removes the sentry', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        const aimDistance = TURRET_SHOT_RANGE / 2;
        const dummy = placeTargetDummy(engine, { x: PLAYER.x, y: PLAYER.y });
        const bodyPad = Math.atan2(dummy.radius, aimDistance);
        const outsideCenterFraction = 0.5;
        const aimAngle = TURRET_CONE_HALF_ANGLE_RAD + bodyPad * outsideCenterFraction;
        dummy.x = PLAYER.x + Math.cos(aimAngle) * aimDistance;
        dummy.y = PLAYER.y + Math.sin(aimAngle) * aimDistance;
        expect(pointInCone(
            PLAYER.x,
            PLAYER.y,
            dummy.x,
            dummy.y,
            1,
            0,
            0,
            TURRET_SHOT_RANGE,
            TURRET_CONE_HALF_ANGLE_RAD,
        )).toBe(false);
        placeTargetDummy(engine, { x: PLAYER.x, y: PLAYER.y + TURRET_SHOT_RANGE }, 'wide');
        engine.state.fieldObjects.spawnDeployable(engine, {
            defId: ARMORY_TURRET_DEF_ID,
            x: PLAYER.x,
            y: PLAYER.y,
            facing: 0,
            teamId: player.teamId,
            ownerUnitId: player.id,
            abilityId: DEPLOY_TURRET_ABILITY_ID,
        });
        const seen = new Set(engine.projectiles.map((projectile) => projectile.id));
        let firstShot: (typeof engine.projectiles)[number] | null = null;
        step(engine, TURRET_FIRST_SHOT_DELAY + FIXED_DT, () => {
            for (const projectile of engine.projectiles) {
                if (seen.has(projectile.id) || firstShot) continue;
                seen.add(projectile.id);
                firstShot = projectile;
            }
        });
        expect(firstShot).not.toBeNull();
        const shotAngle = Math.atan2(firstShot!.velocityY, firstShot!.velocityX);
        expect(shotAngle).toBeCloseTo(aimAngle, 5);
        expect(firstShot!.projectileType).toBe('sprite_projectile');
        expect(firstShot!.radius).toBe(TURRET_SHOT_HIT_RADIUS);
        expect(firstShot!.spriteConfig?.trail?.effectType).toBe('BulletTrail');
        const sprite = firstShot!.spriteConfig?.sprite;
        expect(sprite && 'scale' in sprite ? sprite.scale : undefined).toBe(TURRET_SHOT_SPRITE_SCALE);
        expect(engine.state.fieldObjects.placedDeployables[0]?.chargesRemaining).toBe(TURRET_SHOT_COUNT - 1);
        expect(engine.state.fieldObjects.placedDeployables[0]?.animation?.request).toEqual(DeployTurretAbility.animation);
        expect(engine.state.fieldObjects.placedDeployables[0]?.animation?.startedAtGameTime).toBeGreaterThanOrEqual(TURRET_FIRST_SHOT_DELAY);

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
        empty.state.fieldObjects.spawnDeployable(empty, {
            defId: ARMORY_TURRET_DEF_ID,
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
        expect(empty.state.fieldObjects.placedDeployables).toHaveLength(0);
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

function maceBattle(): { engine: GameEngine } {
    const engine = buildTinyBattleEngine({
        gridW: 20,
        gridH: 20,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
    });
    placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
        researchTrees: { [ARMORY_TREE_ID]: [ARMORY_NODE_CORE, ARMORY_NODE_CREATE_MACE] },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine };
}

describe('Create Mace', () => {
    it('uses the quench mace and is granted by its own research node', () => {
        expect(CreateMaceAbility_1005.image).toBe(ChargeMaceAbility_1006.image);
        expect(WhirlAbility_1007.image).toBe(whirlSvg);
        expect(WhirlAbility_1007.image).toContain(ARMORY_PRIMARY_COLOR);
        expect(WhirlAbility_1007.image).toContain(ARMORY_SECONDARY_COLOR);
        expect(CreateMaceAbility_1005.image).toContain(ARMORY_PRIMARY_COLOR);
        expect(CreateMaceAbility_1005.image).toContain(ARMORY_SECONDARY_COLOR);
        expect(CreateMaceAbility_1005.image).toContain(ARMORY_PRIMARY_SHADE_COLOR);
        expect(CreateMaceAbility_1005.name).toBe('Create Mace');
        expect(ChargeMaceAbility_1006.name).toBe('Charge Mace');
        expect(WhirlAbility_1007.name).toBe('Whirl');
        const node = armoryTree.nodes.find((entry) => entry.id === ARMORY_NODE_CREATE_MACE);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: CREATE_MACE_ABILITY_ID }]);
        expect(node?.prereqNodeIds).toEqual([ARMORY_NODE_CORE]);

        const { engine } = maceBattle();
        const player = engine.units[0]!;
        expect(player.abilities).toContain(CREATE_MACE_ABILITY_ID);
    });

    it('swings like a mace, then Whirl stuns adjacent enemies and drops the weapon', () => {
        const { engine } = maceBattle();
        const player = engine.units[0]!;
        const chargeBefore = player.getResource('charge')?.current ?? 0;
        executeUnitAbility(player, CreateMaceAbility_1005, [], engine);
        const orbit = engine.state.effectManager.effects.find(
            (effect) => effect.effectData?.weaponKind === DROPPED_WEAPON_KIND_MACE,
        );
        expect(orbit).toBeDefined();
        expect(player.getResource('charge')?.current).toBe(chargeBefore - ARMORY_CREATE_CHARGE_COST);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        expect(player.heldConjuredWeapon?.defId).toBe(ARMORY_MACE_WEAPON_ID);
        expect(player.abilities).toContain(CHARGE_MACE_ABILITY_ID);
        expect(player.abilities).toContain(WHIRL_ABILITY_ID);
        expect(player.abilityRuntime[CHARGE_MACE_ABILITY_ID]?.currentUses).toBe(CHARGE_MACE_MAX_USES);
        const swingTiming = ChargeMaceAbility_1006.abilityTimings.find((entry) => isAbilityTimingInterval(entry) && entry.id === 'hit');
        const swingDef = swingTiming && isAbilityTimingInterval(swingTiming) ? swingTiming.targetDef : undefined;
        if (!swingDef || !isSelectTargetDef(swingDef)) {
            throw new Error('Charge Mace hit select is missing');
        }
        expect(swingDef.hitbox).toBe(SWING_BAT_HITBOX);

        const swingDummy = placeTargetDummy(engine, { x: PLAYER.x + SWING_BAT_HITBOX.maxRange, y: PLAYER.y }, 'mace_swing');
        const swingHp = swingDummy.hp;
        engine.waitingForOrders = null;
        executeUnitAbility(player, ChargeMaceAbility_1006, [{ type: 'pixel', position: { x: swingDummy.x, y: swingDummy.y } }], engine);
        step(engine, CHARGE_MACE_IMPACT_TIME + FIXED_DT);
        expect(swingDummy.hp).toBeLessThan(swingHp);
        expect(player.heldConjuredWeapon).not.toBeNull();

        const whirlHit = WhirlAbility_1007.abilityTimings.find((entry) => isAbilityTimingInterval(entry) && entry.id === 'hit');
        const whirlDef = whirlHit && isAbilityTimingInterval(whirlHit) ? whirlHit.targetDef : undefined;
        if (!whirlHit || !isAbilityTimingInterval(whirlHit) || !whirlDef || !isSelectTargetDef(whirlDef)) {
            throw new Error('Whirl hit select is missing');
        }
        expect(whirlHit.start).toBe(SWING_BAT_WINDUP_END);
        expect(whirlDef.label).toBe(WHIRL_TARGET_LABEL);
        expect(whirlDef.confirmAtCaster).toBe(true);
        expect(whirlDef.hitbox.maxRange).toBe(MACE_WHIRL_OUTER_RADIUS);
        expect(findPreviewDeferredSelectLabel(WhirlAbility_1007, player, engine)).toBeNull();

        const inner = player.radius + MACE_WHIRL_INNER_CLEARANCE;
        const adjacentDistance = (inner + MACE_WHIRL_OUTER_RADIUS) / 2;
        const adjacent = Array.from({ length: MACE_WHIRL_MAX_TARGETS + 1 }, (_, index) => {
            const angle = (index / (MACE_WHIRL_MAX_TARGETS + 1)) * Math.PI * 2;
            return placeTargetDummy(engine, {
                x: player.x + Math.cos(angle) * adjacentDistance,
                y: player.y + Math.sin(angle) * adjacentDistance,
            }, `mace_adj_${index}`);
        });
        const holeDistance = MACE_WHIRL_INNER_CLEARANCE / 2;
        const hole = placeTargetDummy(engine, { x: player.x + holeDistance, y: player.y }, 'mace_hole');
        expect(holeDistance + hole.radius).toBeLessThanOrEqual(inner);
        const far = placeTargetDummy(engine, { x: player.x + CELL_SIZE * 4, y: player.y }, 'mace_far');
        const clickAway = { x: player.x + CELL_SIZE * 3, y: player.y };
        const confirmed = resolveItsSelectTargetForClick(
            WhirlAbility_1007,
            player,
            whirlDef,
            clickAway,
            clickAway,
            {},
            engine,
        );
        expect(confirmed).not.toBeNull();
        const aimPixel = confirmed!.orderTargets[confirmed!.orderTargets.length - 1];
        expect(aimPixel).toEqual({ type: 'pixel', position: { x: player.x, y: player.y } });
        const locked = confirmed!.orderTargets.filter((target) => target.type === 'unit');
        expect(locked).toHaveLength(MACE_WHIRL_MAX_TARGETS);
        expect(locked.some((target) => target.unitId === hole.id)).toBe(false);
        engine.waitingForOrders = null;
        const hpBeforeWhirl = new Map([...adjacent, swingDummy].map((unit) => [unit.id, unit.hp]));
        executeUnitAbility(player, WhirlAbility_1007, confirmed!.orderTargets, engine);
        step(engine, MACE_WHIRL_SWEEP_END + FIXED_DT * 2);
        // The sweep strikes the first five it reaches, which can include the dummy from the swing above.
        const struck = [...adjacent, swingDummy].filter((unit) => unit.hp < hpBeforeWhirl.get(unit.id)!);
        expect(struck).toHaveLength(MACE_WHIRL_MAX_TARGETS);
        for (const unit of struck) expect(unit.hasBuff('stunned')).toBe(true);
        expect(hole.hp).toBe(hole.maxHp);
        expect(far.hp).toBe(far.maxHp);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        expect(engine.state.fieldObjects.droppedWeapons[0]?.kind).toBe(DROPPED_WEAPON_KIND_MACE);
        expect(player.abilityRuntime[CREATE_MACE_ABILITY_ID]?.active).not.toBe(false);
    });
});

function shieldBattle(): { engine: GameEngine } {
    const engine = buildTinyBattleEngine({
        gridW: 20,
        gridH: 20,
        localPlayerId: TINY_BATTLE_PLAYER_ID,
    });
    placePlayerFromLoadout(engine, {
        playerId: TINY_BATTLE_PLAYER_ID,
        world: PLAYER,
        equipment: [CORE_ITEM_IDS.BasicCore, swordItem.id],
        researchTrees: { [ARMORY_TREE_ID]: [ARMORY_NODE_CORE, ARMORY_NODE_CREATE_SHIELD] },
    });
    engine.waitingForOrders = null;
    engine.isPaused = false;
    return { engine };
}

/** Raise the buckler toward {@link AIM_POINT} and hold it once the block window closes. */
function conjureShield(engine: GameEngine): Unit {
    const player = engine.units[0]!;
    executeUnitAbility(player, CreateShieldAbility_1008, [AIM], engine);
    step(engine, CREATE_SHIELD_CAST_DURATION + FIXED_DT);
    engine.waitingForOrders = null;
    return player;
}

function charge(unit: Unit): number {
    return unit.getResource('charge')?.current ?? 0;
}

describe('Create Shield', () => {
    it('draws a quench buckler and is granted by its own research node', () => {
        for (const image of [shieldSvg, shieldThrowSvg, ReleaseChargeAbility_1009.image]) {
            expect(image).toContain(ARMORY_PRIMARY_COLOR);
            expect(image).toContain(ARMORY_SECONDARY_COLOR);
            expect(image).toContain(ARMORY_PRIMARY_SHADE_COLOR);
        }
        expect(CreateShieldAbility_1008.image).toBe(shieldSvg);
        expect(ThrowShieldAbility_1010.image).toBe(shieldThrowSvg);
        expect(CreateShieldAbility_1008.name).toBe('Create Shield');
        expect(ReleaseChargeAbility_1009.name).toBe('Release Charge');
        expect(ThrowShieldAbility_1010.name).toBe('Throw Shield');
        expect(CREATE_SHIELD_CAST_DURATION).toBe(CREATE_SWORD_CAST_DURATION);
        expect(CreateShieldAbility_1008.resourceCost).toEqual({ resourceId: 'charge', amount: ARMORY_CREATE_CHARGE_COST });
        expect(ReleaseChargeAbility_1009.resourceCost).toEqual({ resourceId: 'charge', amount: ARMORY_ECHO_CHARGE_COST });
        expect(ThrowShieldAbility_1010.resourceCost).toBeNull();
        const node = armoryTree.nodes.find((entry) => entry.id === ARMORY_NODE_CREATE_SHIELD);
        expect(node?.effects).toEqual([{ type: 'addCard', cardId: CREATE_SHIELD_ABILITY_ID }]);
        expect(node?.prereqNodeIds).toEqual([ARMORY_NODE_CORE]);

        const { engine } = shieldBattle();
        expect(engine.units[0]!.abilities).toContain(CREATE_SHIELD_ABILITY_ID);
    });

    it('blocks, gains Charge once, orbits bucklers, then holds Release Charge and Throw Shield', () => {
        const { engine } = shieldBattle();
        const player = engine.units[0]!;
        const attacker = placeTargetDummy(engine, { x: PLAYER.x + CELL_SIZE * 3, y: PLAYER.y }, 'shield_attacker');
        const chargeBefore = charge(player);
        executeUnitAbility(player, CreateShieldAbility_1008, [AIM], engine);
        expect(charge(player)).toBe(chargeBefore - ARMORY_CREATE_CHARGE_COST);
        const orbit = engine.state.effectManager.effects.find(
            (effect) => effect.effectData?.weaponKind === DROPPED_WEAPON_KIND_SHIELD,
        );
        expect(orbit).toBeDefined();

        const hp = player.hp;
        for (const offset of [0, 12]) {
            engine.addProjectile(new Projectile({
                x: attacker.x - offset,
                y: attacker.y,
                velocityX: -400,
                velocityY: 0,
                damage: 5,
                sourceTeamId: attacker.teamId,
                sourceUnitId: attacker.id,
                sourceAbilityId: 'throw_rock',
                maxDistance: CELL_SIZE * 4,
            }));
        }
        step(engine, CREATE_SHIELD_CAST_DURATION / 2);
        expect(player.hp).toBe(hp);
        expect(charge(player)).toBe(chargeBefore - ARMORY_CREATE_CHARGE_COST + SHIELD_BLOCK_CHARGE_GRANT);
        expect(player.heldConjuredWeapon).toBeNull();

        step(engine, CREATE_SHIELD_CAST_DURATION / 2 + FIXED_DT);
        expect(player.heldConjuredWeapon?.defId).toBe(ARMORY_SHIELD_WEAPON_ID);
        expect(player.abilities).toContain(RELEASE_CHARGE_ABILITY_ID);
        expect(player.abilities).toContain(THROW_SHIELD_ABILITY_ID);
        expect(player.abilityRuntime[swordItem.cardsToAdd[0]!]?.active).toBe(false);
        expect(player.abilityRuntime[RELEASE_CHARGE_ABILITY_ID]?.currentUses).toBe(1);
        expect(player.abilityRuntime[THROW_SHIELD_ABILITY_ID]?.currentUses).toBe(1);
    });

    it('holds the buckler without Charge when nothing is blocked', () => {
        const { engine } = shieldBattle();
        const player = engine.units[0]!;
        const chargeBefore = charge(player);
        conjureShield(engine);
        expect(charge(player)).toBe(chargeBefore - ARMORY_CREATE_CHARGE_COST);
        expect(player.heldConjuredWeapon?.defId).toBe(ARMORY_SHIELD_WEAPON_ID);
    });

    it('Release Charge spends Charge, stuns the cone, and puts the buckler away without a token', () => {
        const { engine } = shieldBattle();
        const target = placeTargetDummy(engine, AIM_POINT, 'release_target');
        const player = conjureShield(engine);
        player.getResource('charge')!.add(ARMORY_ECHO_CHARGE_COST);
        const chargeBefore = charge(player);
        executeUnitAbility(player, ReleaseChargeAbility_1009, [AIM], engine);
        expect(charge(player)).toBe(chargeBefore - ARMORY_ECHO_CHARGE_COST);
        step(engine, CONE_OF_LIGHT_ACTIVE_END + FIXED_DT);
        expect(target.hp).toBeLessThan(target.maxHp);
        expect(target.hasBuff('stunned')).toBe(true);
        step(engine, CONE_OF_LIGHT_COOLDOWN_END - CONE_OF_LIGHT_ACTIVE_END + FIXED_DT);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(player.abilities).not.toContain(RELEASE_CHARGE_ABILITY_ID);
        expect(player.abilities).not.toContain(THROW_SHIELD_ABILITY_ID);
        expect(player.abilityRuntime[swordItem.cardsToAdd[0]!]?.active).not.toBe(false);
        expect(player.abilityRuntime[CREATE_SHIELD_ABILITY_ID]?.active).not.toBe(false);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(0);
    });

    it('Throw Shield bounces to a second enemy and falls there, with a thick tapered trail', () => {
        const { engine } = shieldBattle();
        const first = placeTargetDummy(engine, AIM_POINT, 'throw_first');
        const second = placeTargetDummy(engine, { x: AIM_POINT.x, y: AIM_POINT.y + CELL_SIZE * 2 }, 'throw_second');
        const bystander = placeTargetDummy(engine, { x: AIM_POINT.x, y: AIM_POINT.y - CELL_SIZE * 2.5 }, 'throw_bystander');
        expect(CELL_SIZE * 2).toBeLessThan(THROW_SHIELD_BOUNCE_RANGE);
        const player = conjureShield(engine);
        const chargeBefore = charge(player);
        executeUnitAbility(player, ThrowShieldAbility_1010, [AIM], engine);
        let thrown: Projectile | null = null;
        const trailRadii: number[] = [];
        step(engine, THROW_SHIELD_COOLDOWN_END + 0.6, () => {
            for (const projectile of engine.projectiles) {
                if (projectile.sourceAbilityId === THROW_SHIELD_ABILITY_ID) thrown = projectile;
            }
            for (const effect of engine.state.effectManager.effects) {
                if (effect.effectType === 'BulletTrail' && effect.effectRadius != null) trailRadii.push(effect.effectRadius);
            }
        });
        expect(charge(player)).toBe(chargeBefore);
        const shot = thrown as Projectile | null;
        expect(shot).not.toBeNull();
        const frames = shot!.spriteConfig?.sprite;
        expect(frames && 'frameFiles' in frames ? frames.frameFiles[0] : null).toBe(shieldProjectileUrl);
        expect(shot!.trailRadius).toBe(THROW_SHIELD_TRAIL_RADIUS);
        expect(THROW_SHIELD_TRAIL_RADIUS).toBeGreaterThan(DEFAULT_BULLET_TRAIL_RADIUS);
        expect(shot!.trailTaper).toBe(true);
        expect(Math.max(...trailRadii)).toBeGreaterThan(Math.min(...trailRadii));

        expect(first.maxHp - first.hp).toBe(THROW_SHIELD_DAMAGE);
        expect(second.maxHp - second.hp).toBe(THROW_SHIELD_DAMAGE);
        expect(bystander.hp).toBe(bystander.maxHp);
        expect(player.heldConjuredWeapon).toBeNull();
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        expect(dropped.kind).toBe(DROPPED_WEAPON_KIND_SHIELD);
        expect(Math.hypot(dropped.x - second.x, dropped.y - second.y)).toBeCloseTo(DROPPED_WEAPON_ARC_DISTANCE, 0);
    });

    it('Throw Shield falls at the first enemy when no second enemy is in range', () => {
        const { engine } = shieldBattle();
        const first = placeTargetDummy(engine, AIM_POINT, 'throw_only');
        const player = conjureShield(engine);
        executeUnitAbility(player, ThrowShieldAbility_1010, [AIM], engine);
        step(engine, THROW_SHIELD_COOLDOWN_END + 0.6);
        expect(first.maxHp - first.hp).toBe(THROW_SHIELD_DAMAGE);
        expect(engine.projectiles.some((projectile) => projectile.sourceAbilityId === THROW_SHIELD_ABILITY_ID)).toBe(false);
        expect(engine.state.fieldObjects.droppedWeapons).toHaveLength(1);
        const dropped = engine.state.fieldObjects.droppedWeapons[0]!;
        expect(Math.hypot(dropped.x - first.x, dropped.y - first.y)).toBeCloseTo(DROPPED_WEAPON_ARC_DISTANCE, 0);
        expect(player.abilityRuntime[CREATE_SHIELD_ABILITY_ID]?.active).not.toBe(false);
    });
});

/** Put a resting token straight onto the field (no toss arc), owned by `owner`. */
function placeToken(engine: GameEngine, owner: Unit, kind: string, at: { x: number; y: number }, ownerUnitId = owner.id): string {
    const id = `test_drop_${kind}_${at.x}_${at.y}_${ownerUnitId}`;
    engine.state.fieldObjects.droppedWeapons.push({
        id,
        x: at.x,
        y: at.y,
        kind,
        ownerUnitId,
        teamId: owner.teamId,
        abilityId: 'test',
        spawnedAtGameTime: 0,
        facing: 0,
    });
    return id;
}

function tokenIds(engine: GameEngine): string[] {
    return engine.state.fieldObjects.droppedWeapons.map((weapon) => weapon.id);
}

describe('Echo', () => {
    it('makes the Create abilities cheap, with two uses refilled each round, and the echo abilities cost Charge', () => {
        for (const ability of [CreateSwordAbility, CreateMaceAbility_1005, CreateShieldAbility_1008]) {
            expect(ability.resourceCost).toEqual({ resourceId: 'charge', amount: 1 });
            expect(ability.maxUses).toBe(ARMORY_CREATE_MAX_USES);
            expect(ability.recoveries).toEqual([
                { chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: ARMORY_CREATE_MAX_USES },
            ]);
        }
        for (const ability of [ThrowSwordAbility, WhirlAbility_1007, ReleaseChargeAbility_1009]) {
            expect(ability.resourceCost).toEqual({ resourceId: 'charge', amount: ARMORY_ECHO_CHARGE_COST });
        }
        expect(THROW_SWORD_DAMAGE).toBe(6);
        expect(RELEASE_CHARGE_DAMAGE).toBe(10);
        expect(ThrowSwordAbility.getTooltipText()).toContain('{Echo: Sword}');
        expect(WhirlAbility_1007.getTooltipText()).toContain('{Echo: Mace}');
        expect(ReleaseChargeAbility_1009.getTooltipText()).toContain('{Echo: Shield}');
    });

    it('Throw Sword also throws from each of your dropped swords, each aimed at the cursor, and destroys them', () => {
        const { engine } = armoryBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateSwordAbility, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        const token = { x: PLAYER.x, y: PLAYER.y + CELL_SIZE * 3 };
        const echoId = placeToken(engine, player, DROPPED_WEAPON_KIND_SWORD, token);
        const allyId = placeToken(engine, player, DROPPED_WEAPON_KIND_SWORD, { x: PLAYER.x, y: PLAYER.y - CELL_SIZE * 3 }, 'ally');
        // Halfway from the token to the cursor: only an echo aimed at the cursor passes through it.
        const target = placeTargetDummy(engine, { x: (token.x + AIM_POINT.x) / 2, y: (token.y + AIM_POINT.y) / 2 }, 'echo_throw_target');

        const preview = { lines: [] as Array<{ x0: number; y0: number }>, cursor: { x: 0, y: 0 } };
        ThrowSwordAbility.renderTargetingPreviewSelectedTargets!(
            {
                clear(): void {},
                moveTo(x: number, y: number): void { preview.cursor = { x, y }; },
                lineTo(): void { preview.lines.push({ x0: preview.cursor.x, y0: preview.cursor.y }); },
                circle(): void {},
                fill(): void {},
                stroke(): void {},
            },
            player,
            [],
            AIM_POINT,
            engine.units,
            engine,
        );
        expect(preview.lines).toEqual([{ x0: player.x, y0: player.y }, { x0: token.x, y0: token.y }]);

        engine.waitingForOrders = null;
        executeUnitAbility(player, ThrowSwordAbility, [AIM], engine);
        let echoAngle: number | null = null;
        step(engine, THROW_SWORD_COOLDOWN_END + FIXED_DT, () => {
            const echo = engine.projectiles.find((projectile) => projectile.expireData?.echoThrow);
            if (echo && echoAngle == null) echoAngle = Math.atan2(echo.velocityY, echo.velocityX);
        });
        expect(echoAngle).toBeCloseTo(Math.atan2(AIM_POINT.y - token.y, AIM_POINT.x - token.x));
        expect(tokenIds(engine)).not.toContain(echoId);
        expect(tokenIds(engine)).toContain(allyId);
        step(engine, 3);
        expect(target.maxHp - target.hp).toBe(THROW_SWORD_DAMAGE);
        const swords = engine.state.fieldObjects.droppedWeapons.filter(
            (weapon) => weapon.ownerUnitId === player.id && weapon.kind === DROPPED_WEAPON_KIND_SWORD,
        );
        expect(swords).toHaveLength(1);
    });

    it('Whirl also whirls around each of your dropped maces, then destroys them', () => {
        const { engine } = maceBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateMaceAbility_1005, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        const token = { x: PLAYER.x, y: PLAYER.y + CELL_SIZE * 5 };
        const echoId = placeToken(engine, player, DROPPED_WEAPON_KIND_MACE, token);
        const near = placeTargetDummy(engine, { x: token.x + MACE_WHIRL_OUTER_RADIUS - 10, y: token.y }, 'whirl_echo_near');
        const far = placeTargetDummy(engine, { x: token.x + MACE_WHIRL_OUTER_RADIUS + CELL_SIZE, y: token.y }, 'whirl_echo_far');

        const { gr, circles } = previewRecorder();
        WhirlAbility_1007.renderSelectTargetPreviewExtras!(gr, player, engine);
        expect(circles).toContainEqual({ x: token.x, y: token.y, r: MACE_WHIRL_OUTER_RADIUS });

        engine.waitingForOrders = null;
        executeUnitAbility(player, WhirlAbility_1007, [{ type: 'pixel', position: { x: player.x, y: player.y } }], engine);
        step(engine, MACE_WHIRL_SWEEP_END + FIXED_DT * 2);
        expect(near.maxHp - near.hp).toBe(WHIRL_DAMAGE);
        expect(near.hasBuff('stunned')).toBe(true);
        expect(far.hp).toBe(far.maxHp);
        expect(tokenIds(engine)).not.toContain(echoId);
        // The mace this whirl drops is new, and stays.
        expect(engine.state.fieldObjects.droppedWeapons.filter((weapon) => weapon.kind === DROPPED_WEAPON_KIND_MACE)).toHaveLength(1);
    });

    it('Release Charge bursts in a smaller circle around each of your dropped bucklers, then destroys them', () => {
        const { engine } = shieldBattle();
        const player = conjureShield(engine);
        player.getResource('charge')!.add(ARMORY_ECHO_CHARGE_COST);
        const token = { x: PLAYER.x, y: PLAYER.y + CELL_SIZE * 5 };
        const echoId = placeToken(engine, player, DROPPED_WEAPON_KIND_SHIELD, token);
        const near = placeTargetDummy(engine, { x: token.x + RELEASE_CHARGE_ECHO_RADIUS - 10, y: token.y }, 'release_echo_near');
        const far = placeTargetDummy(engine, { x: token.x + RELEASE_CHARGE_ECHO_RADIUS + CELL_SIZE, y: token.y }, 'release_echo_far');

        const { gr, circles } = previewRecorder();
        ReleaseChargeAbility_1009.renderSelectTargetPreviewExtras!(gr, player, engine);
        expect(circles).toContainEqual({ x: token.x, y: token.y, r: RELEASE_CHARGE_ECHO_RADIUS });

        executeUnitAbility(player, ReleaseChargeAbility_1009, [AIM], engine);
        step(engine, CONE_OF_LIGHT_ACTIVE_END + FIXED_DT);
        expect(near.maxHp - near.hp).toBe(RELEASE_CHARGE_DAMAGE);
        expect(near.hasBuff('stunned')).toBe(true);
        expect(far.hp).toBe(far.maxHp);
        expect(tokenIds(engine)).not.toContain(echoId);
    });
});

describe('Whirl sweep', () => {
    it('turns around the caster, striking each side as the arc reaches it, in fading segments', () => {
        const { engine } = maceBattle();
        const player = engine.units[0]!;
        executeUnitAbility(player, CreateMaceAbility_1005, [], engine);
        step(engine, CREATE_SWORD_CAST_DURATION + FIXED_DT);
        const reach = (player.radius + MACE_WHIRL_INNER_CLEARANCE + MACE_WHIRL_OUTER_RADIUS) / 2;
        // The sweep starts at screen right and turns clockwise (down first, on screen).
        const first = placeTargetDummy(engine, { x: player.x + reach, y: player.y + 4 }, 'sweep_first');
        const last = placeTargetDummy(engine, { x: player.x + reach * 0.7, y: player.y - reach * 0.7 }, 'sweep_last');
        engine.waitingForOrders = null;
        executeUnitAbility(player, WhirlAbility_1007, [{ type: 'pixel', position: { x: player.x, y: player.y } }], engine);

        const hitTick: Record<string, number> = {};
        let tick = 0;
        let segments = 0;
        const segmentTicks: number[] = [];
        const seenEffects = new Set<unknown>();
        // Two extra ticks for the hitstop each hit gives the caster.
        stepTicks(engine, Math.ceil(MACE_WHIRL_SWEEP_END / FIXED_DT) + 4, () => {
            tick += 1;
            for (const unit of [first, last]) {
                if (hitTick[unit.id] == null && unit.hp < unit.maxHp) hitTick[unit.id] = tick;
            }
            for (const effect of engine.state.effectManager.effects) {
                if (effect.effectType !== ARC_SEGMENT_EFFECT_TYPE || seenEffects.has(effect)) continue;
                seenEffects.add(effect);
                segments += 1;
                segmentTicks.push(tick);
                expect(effect.duration).toBeCloseTo(MACE_WHIRL_SEGMENT_LIFETIME);
                expect(effect.effectData?.colorFrom).toBe(ARMORY_PRIMARY_COLOR_NUM);
                expect(effect.effectData?.colorTo).toBe(ARMORY_SECONDARY_COLOR_NUM);
            }
        });
        expect(segments).toBe(MACE_WHIRL_SEGMENTS);
        // One segment a tick: never two on the same tick.
        expect(new Set(segmentTicks).size).toBe(segmentTicks.length);
        expect(hitTick[first.id]).toBeDefined();
        expect(hitTick[last.id]).toBeDefined();
        expect(hitTick[last.id]!).toBeGreaterThan(hitTick[first.id]! + MACE_WHIRL_SEGMENTS / 2);
    });
});
