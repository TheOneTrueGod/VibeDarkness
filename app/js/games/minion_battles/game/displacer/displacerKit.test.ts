/**
 * Displacer Spirit kit: Light Eater, Phantom Decoy, clone mirroring, AI round gating, kiting,
 * and placement. Engine-level tests (orders applied directly, per CLAUDE.md the BattleNet layer
 * is bypassed).
 */

import { describe, expect, it } from 'vitest';
import {
    buildTinyBattleEngine,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../testing/harness/buildTinyBattleEngine';
import { createUnitFromSpawnConfig } from '../units/index';
import type { GameEngine } from '../GameEngine';
import type { Unit } from '../units/Unit';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import { isUnitAirborne } from '../terrainEffects/tileTransitions';
import { TerrainType } from '../../terrain/TerrainType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { enemySpawnDefToSpawnDefinition } from '../units/spawning/adapters';
import { ENEMY_DISPLACER_CLONE, ENEMY_DISPLACER_SPIRIT } from '../../constants/enemyConstants';
import { initializeAbilityRuntimeForUnit } from '../../abilities/abilityUses';
import { pickBestAbility, getRoundFraction, isInRoundWindow } from '../units/unitAI/utils';
import type { AIContext } from '../units/unitAI/types';
import { addUnitTag, hasUnitTag, UnitTag } from '../units/unitTag';
import { LightSource } from '../lightSources/LightSource';
import {
    FRENZIED_BOLT_LOCK_TIME,
    FRENZIED_BOLT_PREFIRE_TIME,
    FRENZIED_DISPLACER_BOLT_ID,
} from '../../card_defs/dark_animals/0020_FrenziedDisplacerBolt/0020Ability';
import {
    DISPLACER_BOLT_ENRAGED_TIME_SCALE,
    DISPLACER_BOLT_ENRAGED_USES_PER_ROUND,
    DISPLACER_BOLT_USES_PER_ROUND,
    LIGHT_EATER_ENRAGED_RING_MULTIPLIER,
    PHANTOM_DECOY_ENRAGED_CLONE_COUNT,
} from './displacerConstants';
import {
    LIGHT_EATER_EXPLOSION_DAMAGE,
    LIGHT_EATER_EXPLOSION_RADIUS,
    LIGHT_EATER_EXPLODE_TIME,
    LIGHT_EATER_ID,
    LIGHT_EATER_LIGHT_REDUCTION,
    LIGHT_EATER_SUPER_GAIN,
    LIGHT_EATER_FLIGHT_TIME,
    LIGHT_EATER_HEAL,
    LIGHT_EATER_RING_PROJECTILES,
    LIGHT_EATER_LANDING_TIME,
    LIGHT_EATER_TELEGRAPH_SEC,
    LIGHT_EATER_WINDUP_TIME,
    LightEaterAbility,
    readLightEaterPayload,
    devourLight,
    devourLightsInRadius,
    findNearestLightTile,
    lightTileCenter,
} from '../../card_defs/dark_animals/0018_LightEater/0018Ability';
import { PHANTOM_DECOY_ID, PHANTOM_DECOY_WINDUP } from '../../card_defs/dark_animals/0019_PhantomDecoy/0019Ability';
import {
    DISPLACER_BOLT_DAMAGE,
    DISPLACER_BOLT_ID,
    DISPLACER_BOLT_PROJECTILE_RADIUS,
    DISPLACER_BOLT_SPEED,
    DISPLACER_BOLT_TRAVEL_DISTANCE,
} from '../../card_defs/dark_animals/0017_DisplacerBolt/0017Ability';
import {
    CLONE_MIRROR_MAX_CLONES,
    CLONE_MIRROR_STAGGER_SEC,
    CLONE_MIRROR_START_DELAY_SEC,
    DISPLACER_CLONE_ID,
    DISPLACER_STARTING_SUPER_BARS,
    DISPLACER_SPIRIT_ID,
    LIGHT_EATER_ROUND_WINDOW,
    PHANTOM_DECOY_CLONE_COUNT,
    PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET,
    PHANTOM_DECOY_ROUND_WINDOW,
    PHANTOM_DECOY_SPAWN_RADIUS,
} from './displacerConstants';
import { mirrorAbilityToClones } from './mirrorToClones';
import { pickCloneSpawnPositions } from './clonePlacement';
import { advanceKite, applyKiteMovement, DISPLACER_KITE_DISTANCE, type KiteState } from '../units/unitAI/displacer/displacerKite';
import { DisplayWiggle } from '../GameRenderer/displayWiggle';
import { getUnitDisplayWiggleRadius } from '../units/unit_defs/unitDef';
import { ROUND_DURATION } from '../gameConstants';
import { SuperBar } from '../../resources/SuperBar';
import { createResourceFromId } from '../../resources/createResourceFromId';

const P = TINY_BATTLE_PLAYER_ID;
const TICKS_PER_SEC = 60;
const cell = (c: number) => c * CELL_SIZE + CELL_SIZE / 2;

/**
 * Engine plus an idle bystander hero. A real player-team unit is required (otherwise the battle
 * ends in defeat); `step` auto-submits its wait orders the way the SimulationRunner does.
 */
function makeEngine(): GameEngine {
    const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: P, grass: true });
    spawnTinyPlayerUnit(engine, { playerId: P, x: cell(0), y: cell(0), abilities: [] });
    return engine;
}

function spawnEnemy(
    engine: GameEngine,
    def: typeof ENEMY_DISPLACER_SPIRIT,
    x: number,
    y: number,
): Unit {
    const [unit] = engine.spawnUnit(
        {
            ...enemySpawnDefToSpawnDefinition({ ...def, position: { x, y } }, 'ai'),
            // Unknown tree id -> no AI tick: the test drives all orders.
            unitAITreeId: 'static_test_no_ai',
        },
        'initialGameSpawn',
    );
    initializeAbilityRuntimeForUnit(unit!);
    return unit!;
}

/**
 * Hostile-to-the-boss stand-in for a player. It is on the player team but AI-owned, so the engine
 * never pauses to wait for orders from it (a real player unit would).
 */
function spawnPlayerTarget(engine: GameEngine, x: number, y: number): Unit {
    const unit = createUnitFromSpawnConfig(
        {
            id: 'player_target',
            characterId: 'dog',
            name: 'Player Target',
            hp: 500,
            x,
            y,
            teamId: 'player',
            ownerId: 'ai',
            unitAITreeId: 'static_test_no_ai',
            unitTags: [UnitTag.CrowdSpacingExempt],
        },
        engine.eventBus,
        engine,
    );
    initializeAbilityRuntimeForUnit(unit);
    engine.addUnit(unit, 'initialGameSpawn');
    return unit;
}

function addLight(engine: GameEngine, id: string, col: number, row: number, amount: number): void {
    engine.addSpecialTile({
        id,
        defId: 'Campfire',
        col,
        row,
        hp: 5,
        maxHp: 5,
        emitsLight: { lightAmount: amount, radius: 4 },
    });
}

/** Advance `seconds` of game time, auto-resolving the idle hero's order pauses. */
function step(engine: GameEngine, seconds: number): void {
    const ticks = Math.ceil(seconds * TICKS_PER_SEC);
    for (let i = 0; i < ticks; i++) {
        const batch = engine.waitingForOrders;
        if (batch) {
            for (const waiter of batch.waiters) {
                engine.state.orderMgr.applyOrder({ unitId: waiter.unitId, abilityId: 'wait', targets: [], endTurn: true });
            }
            engine.tryResumeParallel();
        }
        engine.stepSimulationFixedTicks(1);
    }
}

describe('super resource + unit defs', () => {
    it('Displacer Spirit spawns with 2 super bars; clone has the clone tag and wiggle def', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        expect(boss.getResource('super')?.current).toBe(DISPLACER_STARTING_SUPER_BARS);
        expect(boss.tags).toContain(UnitTag.Boss);
        expect(boss.unitAITreeId).toBe('static_test_no_ai');

        const clone = spawnEnemy(engine, ENEMY_DISPLACER_CLONE, cell(12), cell(8));
        expect(clone.tags).toContain(UnitTag.Clone);
        expect(clone.tags).not.toContain(UnitTag.Boss);
        expect(clone.getResource('super')).toBeUndefined();
        expect(getUnitDisplayWiggleRadius(DISPLACER_CLONE_ID)).toBe(10);
        expect(getUnitDisplayWiggleRadius(DISPLACER_SPIRIT_ID)).toBe(10);
        engine.destroy();
    });

    it('super bar round-trips through the resource factory', () => {
        const res = createResourceFromId('super');
        expect(res).toBeInstanceOf(SuperBar);
    });
});

describe('Light Eater (0018)', () => {
    /** Full-height rock wall between the boss and the light: flight must ignore it. */
    function wallOff(engine: GameEngine, col: number): void {
        const grid = engine.terrainManager!.grid;
        for (let row = 0; row < 16; row++) grid.set(col, row, TerrainType.Rock);
    }

    function fakeGraphics() {
        const circles: { x: number; y: number; r: number }[] = [];
        const gr = {
            circles,
            moveTo: () => {},
            lineTo: () => {},
            circle: (x: number, y: number, r: number) => { circles.push({ x, y, r }); },
            stroke: () => {},
            fill: () => {},
        };
        return gr as unknown as IAbilityPreviewGraphics & { circles: typeof circles };
    }

    it('flies over rocks to the nearest light, lands on it, devours (-4), heals, +1 super, then explodes', () => {
        const engine = makeEngine();
        addLight(engine, 'near', 6, 8, 12);
        addLight(engine, 'far', 20, 8, 12);
        wallOff(engine, 9);
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(12), cell(8));
        const nearCenter = lightTileCenter({ col: 6, row: 8 });
        const player = spawnPlayerTarget(engine, nearCenter.x + 40, nearCenter.y);
        const superBefore = boss.getResource('super')!.current;
        const playerHp = player.hp;
        boss.hp = boss.maxHp - 50;

        expect(findNearestLightTile(engine.specialTiles, boss)?.id).toBe('near');

        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, 0.05);
        // Destination is resolved at cast start and stored in the serialized cast payload.
        expect(readLightEaterPayload(boss.activeAbilities[0])).toEqual({ tileId: 'near', x: nearCenter.x, y: nearCenter.y });
        expect(isUnitAirborne(boss)).toBe(false);

        // Mid-flight: airborne, moving toward the light, still hasn't devoured anything.
        step(engine, LIGHT_EATER_WINDUP_TIME + LIGHT_EATER_FLIGHT_TIME / 2);
        expect(isUnitAirborne(boss)).toBe(true);
        expect(boss.x).toBeLessThan(cell(12));
        expect(boss.x).toBeGreaterThan(nearCenter.x);
        expect(engine.specialTiles.find((t) => t.id === 'near')!.emitsLight!.lightAmount).toBe(12);

        // Landed exactly on the light, grounded, devoured, healed, +super.
        step(engine, LIGHT_EATER_FLIGHT_TIME / 2 + 0.1);
        expect(isUnitAirborne(boss)).toBe(false);
        expect(boss.x).toBeCloseTo(nearCenter.x);
        expect(boss.y).toBeCloseTo(nearCenter.y);
        expect(engine.specialTiles.find((t) => t.id === 'near')!.emitsLight!.lightAmount).toBe(12 - LIGHT_EATER_LIGHT_REDUCTION);
        expect(engine.specialTiles.find((t) => t.id === 'far')!.emitsLight!.lightAmount).toBe(12);
        expect(boss.getResource('super')!.current).toBe(superBefore + LIGHT_EATER_SUPER_GAIN);
        expect(boss.hp).toBe(boss.maxHp - 50 + LIGHT_EATER_HEAL);
        // Telegraphed: no damage yet.
        expect(player.hp).toBe(playerHp);

        step(engine, LIGHT_EATER_TELEGRAPH_SEC + 0.1);
        // The explosion hurts; the ring bolts may add more because the player stands close.
        expect(player.hp).toBeLessThanOrEqual(playerHp - LIGHT_EATER_EXPLOSION_DAMAGE);
        expect(40).toBeLessThan(LIGHT_EATER_EXPLOSION_RADIUS);
        // A second heal fires with the explosion.
        expect(boss.hp).toBe(boss.maxHp - 50 + 2 * LIGHT_EATER_HEAL);
        engine.destroy();
    });

    function boltsOf(engine: GameEngine, boss: Unit) {
        return engine.projectiles.filter((p) => p.sourceUnitId === boss.id && p.sourceAbilityId === DISPLACER_BOLT_ID);
    }

    it('looses a ring of 12 Displacer Bolts at the explosion (none before), 30 degrees apart', () => {
        const engine = makeEngine();
        addLight(engine, 'near', 6, 8, 12);
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        spawnPlayerTarget(engine, cell(22), cell(1));
        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });

        step(engine, LIGHT_EATER_EXPLODE_TIME - 0.1);
        expect(boltsOf(engine, boss)).toHaveLength(0);

        step(engine, 0.2);
        const bolts = boltsOf(engine, boss);
        expect(bolts).toHaveLength(LIGHT_EATER_RING_PROJECTILES);
        expect(LIGHT_EATER_RING_PROJECTILES).toBe(12);
        for (const p of bolts) {
            expect(p.sourceTeamId).toBe(boss.teamId);
            expect(p.damage).toBe(DISPLACER_BOLT_DAMAGE);
            expect(Math.hypot(p.velocityX, p.velocityY)).toBeCloseTo(DISPLACER_BOLT_SPEED);
            expect(p.maxDistance).toBe(DISPLACER_BOLT_TRAVEL_DISTANCE);
            expect(p.radius).toBe(DISPLACER_BOLT_PROJECTILE_RADIUS);
            // Same purple spit-sprite visual as the cast bolt (not the plain default projectile).
            expect(p.projectileType).toBe('sprite_projectile');
        }
        const headings = bolts
            .map((p) => ((Math.atan2(p.velocityY, p.velocityX) * 180) / Math.PI + 360) % 360)
            .sort((a, b) => a - b);
        for (let i = 1; i < headings.length; i++) {
            expect(headings[i]! - headings[i - 1]!).toBeCloseTo(30, 0);
        }
        // Clone mirroring is not involved: no clone casts, boss only used Light Eater.
        expect(boss.abilityRuntime[DISPLACER_BOLT_ID]!.currentUses).toBe(4);
        engine.destroy();
    });

    it('fires no ring when there was no light to devour', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        spawnPlayerTarget(engine, cell(22), cell(1));
        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, LIGHT_EATER_EXPLODE_TIME + 0.2);
        expect(boltsOf(engine, boss)).toHaveLength(0);
        engine.destroy();
    });

    it('heals (capped at max hp), including when the light is extinguished', () => {
        const engine = makeEngine();
        addLight(engine, 'dim', 6, 8, LIGHT_EATER_LIGHT_REDUCTION);
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        spawnPlayerTarget(engine, cell(20), cell(2));
        boss.hp = boss.maxHp - 5;
        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, LIGHT_EATER_LANDING_TIME + 0.1);
        expect(engine.specialTiles.find((t) => t.id === 'dim')).toBeUndefined();
        expect(boss.hp).toBe(boss.maxHp);
        expect(boss.maxHp).toBe(120);
        engine.destroy();
    });

    it('forecasts the blast circle at the light from cast start until the explosion', () => {
        const engine = makeEngine();
        addLight(engine, 'near', 6, 8, 12);
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(12), cell(8));
        spawnPlayerTarget(engine, cell(20), cell(2));
        const lightCenter = lightTileCenter({ col: 6, row: 8 });
        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, 0.1);

        const active = boss.activeAbilities[0]!;
        const early = fakeGraphics();
        LightEaterAbility.renderActivePreview!(early, boss, active, engine.gameTime);
        // Before arrival the circle is already at the light, not on the boss.
        expect(early.circles.length).toBeGreaterThan(0);
        expect(early.circles[0]).toEqual({ x: lightCenter.x, y: lightCenter.y, r: LIGHT_EATER_EXPLOSION_RADIUS });
        expect(boss.x).toBeGreaterThan(lightCenter.x);

        const gone = fakeGraphics();
        LightEaterAbility.renderActivePreview!(gone, boss, active, active.startTime + LIGHT_EATER_EXPLODE_TIME);
        expect(gone.circles).toHaveLength(0);
        engine.destroy();
    });

    it('eliminates a light whose strength is already <= 4', () => {
        const engine = makeEngine();
        addLight(engine, 'dim', 6, 8, LIGHT_EATER_LIGHT_REDUCTION);
        const tile = engine.specialTiles.find((t) => t.id === 'dim')!;
        expect(devourLight(engine, tile)).toBe('eliminated');
        expect(engine.specialTiles.find((t) => t.id === 'dim')).toBeUndefined();

        addLight(engine, 'strong', 7, 8, LIGHT_EATER_LIGHT_REDUCTION + 1);
        const strong = engine.specialTiles.find((t) => t.id === 'strong')!;
        expect(devourLight(engine, strong)).toBe('reduced');
        expect(strong.emitsLight!.lightAmount).toBe(1);
        engine.destroy();
    });
});

describe('Phantom Decoy (0019)', () => {
    it('spends a super bar and conjures 10 non-overlapping clones near the target', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(8), cell(8));
        expect(boss.getResource('super')!.current).toBe(2);
        const bossStart = { x: boss.x, y: boss.y };

        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: PHANTOM_DECOY_ID,
            targets: [{ type: 'unit', unitId: player.id }],
        });
        step(engine, PHANTOM_DECOY_WINDUP + 0.2);

        expect(boss.getResource('super')!.current).toBe(1);
        const clones = engine.units.filter((u) => u.characterId === DISPLACER_CLONE_ID && u.isAlive());
        expect(clones).toHaveLength(PHANTOM_DECOY_CLONE_COUNT);
        for (const c of clones) {
            expect(c.tags).toContain(UnitTag.Clone);
            // One clone swapped into the boss's starting spot (see the swap test); skip its distance check.
            if (Math.hypot(c.x - bossStart.x, c.y - bossStart.y) < 60) continue;
            const d = Math.hypot(c.x - player.x, c.y - player.y);
            expect(d).toBeGreaterThanOrEqual(PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET - 1);
            expect(d).toBeLessThanOrEqual(PHANTOM_DECOY_SPAWN_RADIUS + 1);
        }
        for (let i = 0; i < clones.length; i++) {
            for (let j = i + 1; j < clones.length; j++) {
                const d = Math.hypot(clones[i]!.x - clones[j]!.x, clones[i]!.y - clones[j]!.y);
                // Placement spaces clones PHANTOM_DECOY_MIN_SPACING apart; crowd spacing may nudge them
                // slightly afterwards, but never into overlapping bodies (radius 20 each).
                expect(d).toBeGreaterThanOrEqual(2 * clones[i]!.radius - 2);
            }
        }
        engine.destroy();
    });

    it('spawns clones at the same health fraction as the spirit', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(8), cell(8));
        boss.hp = boss.maxHp * 0.4;
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: PHANTOM_DECOY_ID,
            targets: [{ type: 'unit', unitId: player.id }],
        });
        step(engine, PHANTOM_DECOY_WINDUP + 0.2);
        const clones = engine.units.filter((u) => u.characterId === DISPLACER_CLONE_ID && u.isAlive());
        expect(clones).toHaveLength(PHANTOM_DECOY_CLONE_COUNT);
        for (const c of clones) expect(c.hp / c.maxHp).toBeCloseTo(0.4, 5);
        engine.destroy();
    });

    it('swaps places with one of the new clones', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(8), cell(8));
        const before = { x: boss.x, y: boss.y };
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: PHANTOM_DECOY_ID,
            targets: [{ type: 'unit', unitId: player.id }],
        });
        step(engine, PHANTOM_DECOY_WINDUP + 0.2);

        // The boss now stands among the clones near the player, and a clone took its old spot.
        expect(Math.hypot(boss.x - player.x, boss.y - player.y)).toBeLessThanOrEqual(PHANTOM_DECOY_SPAWN_RADIUS + 50);
        const clones = engine.units.filter((u) => u.characterId === DISPLACER_CLONE_ID && u.isAlive());
        expect(clones.some((c) => Math.hypot(c.x - before.x, c.y - before.y) < 60)).toBe(true);
        engine.destroy();
    });

    it('cannot be cast with no super bars', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(8), cell(8));
        boss.getResource('super')!.current = 0;
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: PHANTOM_DECOY_ID,
            targets: [{ type: 'unit', unitId: player.id }],
        });
        step(engine, PHANTOM_DECOY_WINDUP + 0.2);
        expect(engine.units.filter((u) => u.characterId === DISPLACER_CLONE_ID)).toHaveLength(0);
        engine.destroy();
    });
});

describe('Displacer Bolt clone mirroring (0017)', () => {
    function setup(cloneCount: number) {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(6), cell(8));
        const clones: Unit[] = [];
        for (let i = 0; i < cloneCount; i++) {
            clones.push(spawnEnemy(engine, ENEMY_DISPLACER_CLONE, cell(16), cell(2 + i * 2)));
        }
        const casts: { unitId: string; time: number }[] = [];
        engine.eventBus.on('ability_used', (e: { unitId: string; abilityId: string }) => {
            if (e.abilityId === DISPLACER_BOLT_ID) casts.push({ unitId: e.unitId, time: engine.gameTime });
        });
        return { engine, boss, player, clones, casts };
    }

    it('makes up to 3 clones echo the boss bolt, staggered, without recursion', () => {
        const { engine, boss, player, clones, casts } = setup(5);
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: DISPLACER_BOLT_ID,
            targets: [{ type: 'pixel', position: { x: player.x, y: player.y } }],
        });
        step(engine, CLONE_MIRROR_START_DELAY_SEC + CLONE_MIRROR_MAX_CLONES * CLONE_MIRROR_STAGGER_SEC + 1.5);

        const bossCasts = casts.filter((c) => c.unitId === boss.id);
        const cloneCasts = casts.filter((c) => clones.some((cl) => cl.id === c.unitId));
        expect(bossCasts).toHaveLength(1);
        // Exactly 3 clone casts: clone casts did not mirror again.
        expect(cloneCasts).toHaveLength(CLONE_MIRROR_MAX_CLONES);
        expect(new Set(cloneCasts.map((c) => c.unitId)).size).toBe(CLONE_MIRROR_MAX_CLONES);
        // Staggered: each successive clone starts later by ~the stagger interval.
        const times = cloneCasts.map((c) => c.time).sort((a, b) => a - b);
        for (let i = 1; i < times.length; i++) {
            expect(times[i]! - times[i - 1]!).toBeGreaterThan(CLONE_MIRROR_STAGGER_SEC - 0.1);
        }
        expect(cloneCasts.every((c) => c.time > bossCasts[0]!.time)).toBe(true);
        engine.destroy();
    });

    it('mirrors to fewer clones when fewer exist, and never when the caster is a clone', () => {
        const { engine, clones, player } = setup(2);
        const targets = [{ type: 'pixel' as const, position: { x: player.x, y: player.y } }];
        const fromClone = mirrorAbilityToClones(engine as never, clones[0]!, DISPLACER_BOLT_ID, targets);
        expect(fromClone).toEqual([]);

        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const fromBoss = mirrorAbilityToClones(engine as never, boss, DISPLACER_BOLT_ID, targets);
        expect(fromBoss).toHaveLength(2);
        engine.destroy();
    });
});

describe('Displacer boss AI round gating', () => {
    function makeContext(gameTime: number, tiles: ReturnType<GameEngine['specialTiles']['slice']>): AIContext {
        return {
            gameTime,
            gameTick: Math.floor(gameTime * TICKS_PER_SEC),
            getAbilityUsesThisRound: () => 0,
            getSpecialTiles: () => tiles,
            getUnits: () => [],
            generateRandomInteger: (min: number) => min,
        } as unknown as AIContext;
    }

    function pick(boss: Unit, player: Unit, gameTime: number, withLight: boolean): string | undefined {
        const tiles = withLight
            ? [{ id: 't', defId: 'Campfire', col: 1, row: 1, hp: 5, maxHp: 5, emitsLight: { lightAmount: 12, radius: 4 } }]
            : [];
        return pickBestAbility(boss, [player], makeContext(gameTime, tiles as never))?.ability.id;
    }

    it('round window helpers use fractions of the round', () => {
        expect(getRoundFraction(ROUND_DURATION * 2.25)).toBeCloseTo(0.25);
        expect(isInRoundWindow(ROUND_DURATION * 0.3, LIGHT_EATER_ROUND_WINDOW)).toBe(true);
        expect(isInRoundWindow(ROUND_DURATION * 0.8, LIGHT_EATER_ROUND_WINDOW)).toBe(false);
        expect(isInRoundWindow(ROUND_DURATION * 0.5, PHANTOM_DECOY_ROUND_WINDOW)).toBe(true);
        expect(isInRoundWindow(ROUND_DURATION * 0.4, PHANTOM_DECOY_ROUND_WINDOW)).toBe(false);
    });

    it('Decoy > Light Eater > Bolt, each only inside its round window', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, boss.x - 150, boss.y);

        // First half: only the bolt is eligible.
        expect(pick(boss, player, ROUND_DURATION * 0.2, true)).toBe(DISPLACER_BOLT_ID);
        // Third quarter: Decoy and Light Eater are both eligible; Decoy outranks both the bolt and Light Eater.
        expect(pick(boss, player, ROUND_DURATION * 0.6, true)).toBe(PHANTOM_DECOY_ID);
        // Last quarter: Light Eater's window has closed, so Decoy is still the pick.
        expect(pick(boss, player, ROUND_DURATION * 0.8, true)).toBe(PHANTOM_DECOY_ID);
        // No super bars: Decoy is unaffordable, so Light Eater (second or third quarter) and then the bolt follow.
        boss.getResource('super')!.current = 0;
        expect(pick(boss, player, ROUND_DURATION * 0.6, true)).toBe(LIGHT_EATER_ID);
        expect(pick(boss, player, ROUND_DURATION * 0.8, true)).toBe(DISPLACER_BOLT_ID);
        expect(pick(boss, player, ROUND_DURATION * 0.3, true)).toBe(LIGHT_EATER_ID);
        // No light left to eat: only the bolt remains.
        expect(pick(boss, player, ROUND_DURATION * 0.8, false)).toBe(DISPLACER_BOLT_ID);
        engine.destroy();
    });

    it('Light Eater is only used every other round (rounds 0, 2, 4, ...)', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, boss.x - 150, boss.y);
        boss.getResource('super')!.current = 0; // keep Decoy out of the way
        for (const round of [0, 2, 4]) {
            expect(pick(boss, player, ROUND_DURATION * (round + 0.6), true)).toBe(LIGHT_EATER_ID);
        }
        for (const round of [1, 3, 5]) {
            expect(pick(boss, player, ROUND_DURATION * (round + 0.6), true)).toBe(DISPLACER_BOLT_ID);
        }
        engine.destroy();
    });

    it('Decoy opens at 0.5 rounds, then every 3 rounds (3.5, 6.5, ...)', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, boss.x - 150, boss.y);
        for (const rounds of [0.5, 3.5, 6.5]) {
            expect(pick(boss, player, ROUND_DURATION * rounds, false)).toBe(PHANTOM_DECOY_ID);
        }
        for (const rounds of [1.5, 2.5, 4.5, 5.5]) {
            expect(pick(boss, player, ROUND_DURATION * rounds, false)).toBe(DISPLACER_BOLT_ID);
        }
        engine.destroy();
    });
});

function fakeContextForLos(gameTime: number, walking: boolean, los: (x: number) => boolean) {
    const moves: Array<[number, number]> = [];
    const chases: unknown[] = [];
    let rand = -1000;
    const context = {
        gameTime,
        WORLD_WIDTH: 5000,
        WORLD_HEIGHT: 5000,
        generateRandomInteger: (min: number) => (min === -1000 ? (rand += 330) : min),
        hasLineOfSight: (x: number) => los(x),
        nav: {
            isWalking: () => walking,
            isReachable: () => true,
            chaseUnit: (_u: unknown, t: unknown) => chases.push(t),
            moveToPoint: (_u: unknown, x: number, y: number) => moves.push([x, y]),
            stop: () => undefined,
        },
    } as unknown as AIContext;
    return { context, moves, chases };
}

describe('continuous kiting (boss)', () => {
    function fakeContext(
        gameTime: number,
        walking: boolean,
        opts: { los?: (x: number, y: number) => boolean } = {},
    ) {
        const moves: Array<[number, number]> = [];
        const chases: unknown[] = [];
        let stops = 0;
        let rand = -1000;
        const context = {
            gameTime,
            WORLD_WIDTH: 5000,
            WORLD_HEIGHT: 5000,
            generateRandomInteger: (min: number) => (min === -1000 ? (rand += 400) : min),
            hasLineOfSight: (x: number) => (opts.los ? opts.los(x, 0) : true),
            nav: {
                isWalking: () => walking,
                isReachable: () => true,
                chaseUnit: (_u: unknown, t: unknown) => chases.push(t),
                moveToPoint: (_u: unknown, x: number, y: number) => moves.push([x, y]),
                stop: () => stops++,
            },
        } as unknown as AIContext;
        return { context, moves, chases, stops: () => stops };
    }
    const unit = { x: 1000, y: 1000, aiContext: {} } as unknown as Unit;
    const target = { x: 1300, y: 1000 } as unknown as Unit;

    it('never pauses, and re-issues a destination whenever it is not walking (e.g. after a cast)', () => {
        const a = fakeContext(1, false);
        applyKiteMovement(unit, target, a.context, { continuous: true });
        expect(a.moves).toHaveLength(1);

        // Mid-segment and still walking: leave the goal alone.
        const b = fakeContext(1.1, true);
        applyKiteMovement(unit, target, b.context, { continuous: true });
        expect(b.moves).toHaveLength(0);

        // Walk was interrupted: pick a new destination immediately, never stop.
        const c = fakeContext(1.2, false);
        applyKiteMovement(unit, target, c.context, { continuous: true });
        expect(c.moves).toHaveLength(1);
        expect(c.stops()).toBe(0);

        // Segment expired while walking: flit to a new point rather than pausing.
        const d = fakeContext(10, true);
        applyKiteMovement(unit, target, d.context, { continuous: true });
        expect(d.moves).toHaveLength(1);
        expect(d.stops()).toBe(0);
    });
});

describe('line-of-sight aware kiting', () => {
    const target = { x: 1300, y: 1000 } as unknown as Unit;
    const mk = () => ({ x: 1000, y: 1000, aiContext: {} }) as unknown as Unit;

    it('skips ring points hidden from the target and uses one that can see it', () => {
        // Only ring points to the left of the target (x < 1300) are blocked.
        const f = fakeContextForLos(1, false, (x) => x >= 1300);
        applyKiteMovement(mk(), target, f.context, { continuous: true });
        expect(f.moves).toHaveLength(1);
        expect(f.moves[0]![0]).toBeGreaterThanOrEqual(1300);
        expect(f.chases).toHaveLength(0);
    });

    it('closes in on the target when no ring point has line of sight', () => {
        const f = fakeContextForLos(1, false, () => false);
        applyKiteMovement(mk(), target, f.context, { continuous: true });
        expect(f.moves).toHaveLength(0);
        expect(f.chases).toEqual([target]);
    });

    it('stop/start kiting (clones) also starts a fresh move when its view is blocked and idle', () => {
        const unit = mk();
        (unit.aiContext as KiteState).kiteMode = 'pause';
        (unit.aiContext as KiteState).kiteUntil = 999;
        const f = fakeContextForLos(1, false, () => false);
        applyKiteMovement(unit, target, f.context);
        expect(f.chases).toEqual([target]);
    });
});

describe('kite state machine', () => {
    function rng(values: number[]): (min: number, max: number) => number {
        let i = 0;
        return (min, max) => Math.min(max, Math.max(min, values[i++ % values.length]!));
    }

    it('alternates move and pause segments over time', () => {
        const state: KiteState = {};
        const r = rng([500, 0, 500]);
        const first = advanceKite(state, 0, DISPLACER_KITE_DISTANCE, DISPLACER_KITE_DISTANCE, r);
        expect(first).toMatchObject({ mode: 'move', startedMove: true });
        const mid = advanceKite(state, 0.1, DISPLACER_KITE_DISTANCE, DISPLACER_KITE_DISTANCE, r);
        expect(mid).toMatchObject({ mode: 'move', startedMove: false, startedPause: false });
        const later = advanceKite(state, state.kiteUntil! + 0.01, DISPLACER_KITE_DISTANCE, DISPLACER_KITE_DISTANCE, r);
        expect(later).toMatchObject({ mode: 'pause', startedPause: true });
        const resume = advanceKite(state, state.kiteUntil! + 0.01, DISPLACER_KITE_DISTANCE, DISPLACER_KITE_DISTANCE, r);
        expect(resume).toMatchObject({ mode: 'move', startedMove: true });
    });

    it('cuts a pause short when spacing drifts out of tolerance', () => {
        const state: KiteState = { kiteMode: 'pause', kiteUntil: 100 };
        const res = advanceKite(state, 1, DISPLACER_KITE_DISTANCE + 200, DISPLACER_KITE_DISTANCE, rng([0]));
        expect(res).toMatchObject({ mode: 'move', startedMove: true });
    });

    it('holds ~70% of the bolt range', () => {
        expect(DISPLACER_KITE_DISTANCE).toBeCloseTo(140);
    });
});

describe('clone placement', () => {
    it('returns the requested count inside the annulus with spacing and passability', () => {
        let seed = 7;
        const randomInt = (min: number, max: number) => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return min + (seed % (max - min + 1));
        };
        const center = { x: 500, y: 500 };
        const positions = pickCloneSpawnPositions(center, {
            isFree: (x) => x > 450, // west half blocked
            randomInt,
        });
        expect(positions).toHaveLength(PHANTOM_DECOY_CLONE_COUNT);
        for (const p of positions) {
            expect(p.x).toBeGreaterThan(450);
            const d = Math.hypot(p.x - center.x, p.y - center.y);
            expect(d).toBeGreaterThanOrEqual(PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET - 0.01);
            expect(d).toBeLessThanOrEqual(PHANTOM_DECOY_SPAWN_RADIUS + 0.01);
        }
    });

    it('returns fewer clones when the area is fully blocked', () => {
        const positions = pickCloneSpawnPositions({ x: 0, y: 0 }, { isFree: () => false, randomInt: (min) => min });
        expect(positions).toEqual([]);
    });
});

describe('DisplayWiggle', () => {
    function seededRand(seed = 1): () => number {
        let s = seed;
        return () => {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    it('stays within its radius, eases toward targets, and pauses on arrival', () => {
        const w = new DisplayWiggle(20, seededRand(3));
        let sawPause = false;
        let moved = false;
        for (let i = 0; i < 2000; i++) {
            w.update(1 / 60);
            expect(Math.hypot(w.offsetX, w.offsetY)).toBeLessThanOrEqual(20 + 1e-6);
            if (w.isPaused) sawPause = true;
            if (w.offsetX !== 0 || w.offsetY !== 0) moved = true;
        }
        expect(moved).toBe(true);
        expect(sawPause).toBe(true);
    });

    it('is constant-and-slow: a single frame never jumps more than a few px', () => {
        const w = new DisplayWiggle(20, seededRand(9));
        let prevX = w.offsetX;
        let prevY = w.offsetY;
        for (let i = 0; i < 1000; i++) {
            w.update(1 / 60);
            expect(Math.hypot(w.offsetX - prevX, w.offsetY - prevY)).toBeLessThan(1);
            prevX = w.offsetX;
            prevY = w.offsetY;
        }
    });

    it('does nothing for zero radius or zero dt', () => {
        const none = new DisplayWiggle(0);
        none.update(1);
        expect(none.offsetX).toBe(0);
        const w = new DisplayWiggle(20, seededRand(5));
        w.update(0);
        expect(w.offsetX).toBe(0);
        expect(w.offsetY).toBe(0);
    });

    it('survives one huge dt step without leaving the radius', () => {
        const w = new DisplayWiggle(20, seededRand(11));
        w.update(30);
        expect(Math.hypot(w.offsetX, w.offsetY)).toBeLessThanOrEqual(20 + 1e-6);
    });
});

describe('Displacer Spirit enrage (half health)', () => {
    function castBolt(engine: GameEngine, boss: Unit, player: Unit, seconds: number): number {
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: DISPLACER_BOLT_ID,
            targets: [{ type: 'pixel', position: { x: player.x, y: player.y } }],
        });
        step(engine, seconds);
        return engine.projectiles.filter((p) => p.sourceUnitId === boss.id && p.sourceAbilityId === DISPLACER_BOLT_ID).length;
    }

    it('enrages once, below half health, and not before', () => {
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        expect(boss.enrageDef).toMatchObject({ conditionType: 'health_below_percent', threshold: 0.5, tag: UnitTag.Enraged });
        boss.takeDamage(boss.maxHp * 0.4, null, engine.eventBus);
        expect(hasUnitTag(boss, UnitTag.Enraged)).toBe(false);
        boss.takeDamage(boss.maxHp * 0.15, null, engine.eventBus);
        expect(hasUnitTag(boss, UnitTag.Enraged)).toBe(true);
        engine.destroy();
    });

    it('Phantom Decoy conjures 6 clones calm and 12 enraged', () => {
        expect(PHANTOM_DECOY_CLONE_COUNT).toBe(6);
        expect(PHANTOM_DECOY_ENRAGED_CLONE_COUNT).toBe(12);
        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, cell(8), cell(8));
        addUnitTag(boss, UnitTag.Enraged);
        engine.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: PHANTOM_DECOY_ID,
            targets: [{ type: 'unit', unitId: player.id }],
        });
        step(engine, PHANTOM_DECOY_WINDUP + 0.2);
        const clones = engine.units.filter((u) => u.characterId === DISPLACER_CLONE_ID && u.isAlive());
        expect(clones).toHaveLength(PHANTOM_DECOY_ENRAGED_CLONE_COUNT);
        engine.destroy();
    });

    it('swaps to the Frenzied Displacer Bolt when enraged: 30% faster, more uses per round', () => {
        expect(DISPLACER_BOLT_ENRAGED_TIME_SCALE).toBeCloseTo(0.7);
        expect(DISPLACER_BOLT_ENRAGED_USES_PER_ROUND).toBeGreaterThan(DISPLACER_BOLT_USES_PER_ROUND);
        expect(FRENZIED_BOLT_LOCK_TIME).toBeCloseTo(0.5 * 0.7);
        expect(FRENZIED_BOLT_PREFIRE_TIME).toBeCloseTo(1.0 * 0.7);

        const engine = makeEngine();
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(engine, boss.x - 150, boss.y);
        const pickId = () =>
            pickBestAbility(boss, [player], {
                gameTime: ROUND_DURATION * 0.1,
                gameTick: 1,
                getAbilityUsesThisRound: () => 0,
                getSpecialTiles: () => [],
                getUnits: () => [],
                generateRandomInteger: (min: number) => min,
            } as unknown as AIContext)?.ability.id;
        expect(pickId()).toBe(DISPLACER_BOLT_ID);
        addUnitTag(boss, UnitTag.Enraged);
        expect(pickId()).toBe(FRENZIED_DISPLACER_BOLT_ID);
        expect(boss.abilityRuntime[FRENZIED_DISPLACER_BOLT_ID]!.maxUses).toBe(DISPLACER_BOLT_ENRAGED_USES_PER_ROUND);
        engine.destroy();
    });

    it('the enraged bolt leaves sooner than the calm one, and only one bolt is fired per cast', () => {
        const calm = makeEngine();
        const calmBoss = spawnEnemy(calm, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const calmPlayer = spawnPlayerTarget(calm, cell(6), cell(8));
        // 0.4s in: past the enraged lock time (0.35s) but before the calm one (0.5s).
        expect(castBolt(calm, calmBoss, calmPlayer, 0.4)).toBe(0);
        step(calm, 1.0);
        expect(
            calm.projectiles.filter((p) => p.sourceUnitId === calmBoss.id && p.sourceAbilityId === DISPLACER_BOLT_ID),
        ).toHaveLength(1);
        calm.destroy();

        const enraged = makeEngine();
        const boss = spawnEnemy(enraged, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
        const player = spawnPlayerTarget(enraged, cell(6), cell(8));
        addUnitTag(boss, UnitTag.Enraged);
        enraged.state.orderMgr.applyOrder({
            unitId: boss.id,
            abilityId: FRENZIED_DISPLACER_BOLT_ID,
            targets: [{ type: 'pixel', position: { x: player.x, y: player.y } }],
        });
        step(enraged, 0.4);
        const out = () =>
            enraged.projectiles.filter((p) => p.sourceUnitId === boss.id && p.sourceAbilityId === FRENZIED_DISPLACER_BOLT_ID);
        expect(out()).toHaveLength(1);
        step(enraged, 1.2);
        expect(out()).toHaveLength(1); // no second bolt
        enraged.destroy();
    });

    it('clone echoes follow up faster when the spirit is enraged', () => {
        const timesFor = (enragedBoss: boolean): number[] => {
            const engine = makeEngine();
            const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(18), cell(8));
            const player = spawnPlayerTarget(engine, cell(6), cell(8));
            const clones: Unit[] = [];
            for (let i = 0; i < 4; i++) clones.push(spawnEnemy(engine, ENEMY_DISPLACER_CLONE, cell(16), cell(2 + i * 2)));
            if (enragedBoss) addUnitTag(boss, UnitTag.Enraged);
            const times: number[] = [];
            engine.eventBus.on('ability_used', (e: { unitId: string; abilityId: string }) => {
                if (clones.some((c) => c.id === e.unitId) && e.abilityId === DISPLACER_BOLT_ID) times.push(engine.gameTime);
            });
            engine.state.orderMgr.applyOrder({
                unitId: boss.id,
                abilityId: enragedBoss ? FRENZIED_DISPLACER_BOLT_ID : DISPLACER_BOLT_ID,
                targets: [{ type: 'pixel', position: { x: player.x, y: player.y } }],
            });
            step(engine, 2.5);
            engine.destroy();
            return times.sort((a, b) => a - b);
        };
        const calm = timesFor(false);
        const enraged = timesFor(true);
        expect(calm).toHaveLength(CLONE_MIRROR_MAX_CLONES);
        expect(enraged).toHaveLength(CLONE_MIRROR_MAX_CLONES);
        // Compare spacing between successive echoes: ~30% tighter when enraged.
        const gap = (t: number[]) => t[t.length - 1]! - t[0]!;
        expect(gap(enraged)).toBeLessThan(gap(calm));
        expect(gap(enraged)).toBeCloseTo(gap(calm) * DISPLACER_BOLT_ENRAGED_TIME_SCALE, 0);
    });

    it('Light Eater looses twice as many ring bolts when enraged', () => {
        const engine = makeEngine();
        addLight(engine, 'near', 6, 8, 12);
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        spawnPlayerTarget(engine, cell(22), cell(1));
        addUnitTag(boss, UnitTag.Enraged);
        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, LIGHT_EATER_EXPLODE_TIME + 0.1);
        const ring = engine.projectiles.filter((p) => p.sourceUnitId === boss.id && p.sourceAbilityId === DISPLACER_BOLT_ID);
        expect(ring).toHaveLength(LIGHT_EATER_RING_PROJECTILES * LIGHT_EATER_ENRAGED_RING_MULTIPLIER);
        engine.destroy();
    });
});

describe('Light Eater explosion damages every light in its radius (including player-placed)', () => {
    function playerTorch(engine: GameEngine, x: number, y: number, amount: number): LightSource {
        const ls = new LightSource({
            x,
            y,
            lightAmount: amount,
            radius: 3,
            teamId: 'player',
            ownerUnitId: 'player_target',
            ownerAbilityId: 'test_torch',
            decay: { roundCreated: 0, initialLightAmount: amount, initialRadius: 3, roundsTotal: 5 },
        });
        engine.addLightSource(ls);
        return ls;
    }

    it('hits other tiles and free-standing player lights inside the blast, not ones outside', () => {
        const engine = makeEngine();
        addLight(engine, 'target', 8, 8, 12);
        addLight(engine, 'neighbour', 7, 8, 12); // 40px from the target: inside radius 100 (and farther from the boss than the target)
        addLight(engine, 'far', 14, 8, 12); // far outside
        const boss = spawnEnemy(engine, ENEMY_DISPLACER_SPIRIT, cell(10), cell(8));
        spawnPlayerTarget(engine, cell(22), cell(1));
        const target = engine.specialTiles.find((t) => t.id === 'target')!;
        const c = lightTileCenter(target);
        const nearTorch = playerTorch(engine, c.x + 30, c.y + 20, 8);
        const dimTorch = playerTorch(engine, c.x - 40, c.y, LIGHT_EATER_LIGHT_REDUCTION);
        const farTorch = playerTorch(engine, c.x + 400, c.y, 8);

        engine.state.orderMgr.applyOrder({ unitId: boss.id, abilityId: LIGHT_EATER_ID, targets: [] });
        step(engine, LIGHT_EATER_LANDING_TIME + 0.1);
        // Landing only bit the target tile.
        expect(engine.specialTiles.find((t) => t.id === 'neighbour')!.emitsLight!.lightAmount).toBe(12);
        expect(nearTorch.lightAmount).toBe(8);

        step(engine, LIGHT_EATER_TELEGRAPH_SEC + 0.1);
        // Target tile: bitten once on landing (12 -> 9), not again by the blast.
        expect(engine.specialTiles.find((t) => t.id === 'target')!.emitsLight!.lightAmount).toBe(12 - LIGHT_EATER_LIGHT_REDUCTION);
        expect(engine.specialTiles.find((t) => t.id === 'neighbour')!.emitsLight!.lightAmount).toBe(12 - LIGHT_EATER_LIGHT_REDUCTION);
        expect(engine.specialTiles.find((t) => t.id === 'far')!.emitsLight!.lightAmount).toBe(12);
        // Player torches: damaged (and the decay baseline too), a dim one is put out, a far one untouched.
        expect(nearTorch.lightAmount).toBe(8 - LIGHT_EATER_LIGHT_REDUCTION);
        expect(nearTorch.decay.initialLightAmount).toBe(8 - LIGHT_EATER_LIGHT_REDUCTION);
        expect(nearTorch.active).toBe(true);
        expect(dimTorch.active).toBe(false);
        expect(farTorch.lightAmount).toBe(8);
        expect(farTorch.active).toBe(true);
        engine.destroy();
    });

    it('devourLightsInRadius skips dark-light tiles and spent sources', () => {
        const engine = makeEngine();
        addLight(engine, 'dark', 6, 8, 12);
        const dark = engine.specialTiles.find((t) => t.id === 'dark')!;
        dark.emitsLight = { ...dark.emitsLight!, lightType: 'DarkLight' };
        const c = lightTileCenter(dark);
        const spent = playerTorch(engine, c.x, c.y, 8);
        spent.active = false;
        const res = devourLightsInRadius(engine as never, c, LIGHT_EATER_EXPLOSION_RADIUS);
        expect(res).toEqual({ reduced: 0, eliminated: 0 });
        expect(dark.emitsLight!.lightAmount).toBe(12);
        engine.destroy();
    });
});
