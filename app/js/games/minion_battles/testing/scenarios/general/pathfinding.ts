import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { TerrainType } from '../../../terrain/TerrainType';
import { createDarkWolfUnit } from '../../../game/units/dark_animals/DarkWolf';
import { createUnitFromSpawnConfig } from '../../../game/units/index';
import { initializeAbilityRuntimeForUnit } from '../../../abilities/abilityUses';
import { Movement } from '../../../resources/Movement';
import {
    THORNBINDER_ABILITY_ID,
    THORNBINDER_LOCK_TIME,
    THORN_PROJECTILE_SPEED,
} from '../../../card_defs/0008_ThornbinderBramble/0008Ability';

/** Path scenarios only: no AI tree so scripted move orders are not overwritten. */
function configurePathTestPlayer(engine: GameEngine): void {
    const u = engine.getLocalPlayerUnit();
    if (!u) return;
    u.unitAITreeId = 'static_test_no_ai';
}

function assertPlayerNear(engine: GameEngine, wx: number, wy: number, tol: number): boolean {
    const u = engine.getLocalPlayerUnit();
    if (!u) return false;
    const dx = u.x - wx;
    const dy = u.y - wy;
    return Math.hypot(dx, dy) <= tol;
}

/** Straight-line grid move across open grass (compact grid so mini-map fits the test card). */
export const pathStraightMoveScenario: ScenarioDefinition = {
    id: 'path_straight_move',
    title: 'Straight grid path completes',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 8000,
    buildEngine() {
        /** 11×30px fits AbilityTest scenario cards (max-w ~360px) so the unit dot stays visible. */
        const engine = buildTinyBattleEngine({
            gridW: 11,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const tm = engine.terrainManager!;
        const { x, y } = tm.grid.gridToWorld(1, 4);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x,
            y,
            abilities: ['0120'],
        });
        configurePathTestPlayer(engine);
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(1, 4, 7, 4);
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        if (!u) return false;
        const tm = engine.terrainManager!;
        const goal = tm.grid.gridToWorld(7, 4);
        return u.movement === null && assertPlayerNear(engine, goal.x, goal.y, tm.grid.cellSize * 0.75);
    },
    failureMessage(engine) {
        const u = engine.getLocalPlayerUnit();
        return `movement=${u?.movement ? 'path' : 'null'} pos=${u ? `${u.x},${u.y}` : 'none'}`;
    },
    describeState(engine) {
        const u = engine.getLocalPlayerUnit();
        return u ? `tick=${engine.gameTick} pos=${u.x.toFixed(0)},${u.y.toFixed(0)}` : 'no unit';
    },
};

/** Path must detour around a rock wall blocking the direct corridor. */
export const pathAroundRockScenario: ScenarioDefinition = {
    id: 'path_around_rock',
    title: 'Grid path finds route around rock barrier',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 10000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 11,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const tm = engine.terrainManager!;
        for (let c = 4; c <= 5; c++) {
            tm.grid.set(c, 4, TerrainType.Rock);
        }
        const { x, y } = tm.grid.gridToWorld(1, 4);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x,
            y,
            abilities: ['0120'],
        });
        configurePathTestPlayer(engine);
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(1, 4, 8, 4);
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        if (!u) return false;
        const tm = engine.terrainManager!;
        const goal = tm.grid.gridToWorld(8, 4);
        return u.movement === null && assertPlayerNear(engine, goal.x, goal.y, tm.grid.cellSize);
    },
    failureMessage(engine) {
        const u = engine.getLocalPlayerUnit();
        return `pathfinding failed or stuck: movement=${Boolean(u?.movement)} pos=${u ? `${u.x},${u.y}` : 'none'}`;
    },
};

/** Short move: few cells, finishes quickly. */
export const pathShortCommuteScenario: ScenarioDefinition = {
    id: 'path_short_commute',
    title: 'Short grid move (3 cells east)',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 2000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const tm = engine.terrainManager!;
        const { x, y } = tm.grid.gridToWorld(2, 4);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x,
            y,
            abilities: ['0120'],
        });
        configurePathTestPlayer(engine);
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(2, 4, 5, 4);
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        if (!u) return false;
        const tm = engine.terrainManager!;
        const goal = tm.grid.gridToWorld(5, 4);
        return u.movement === null && assertPlayerNear(engine, goal.x, goal.y, tm.grid.cellSize * 0.6);
    },
    failureMessage(engine) {
        const u = engine.getLocalPlayerUnit();
        return `expected arrival near (5,4); got ${u ? `${u.x},${u.y}` : 'no unit'}`;
    },
};

// ─── Dodge iFrame protection ─────────────────────────────────────────────────

const CELL = 40;
// Player at col 1; wolf 80 px east at col 3; slime 120 px east at col 4.
const IFRAME_PLAYER = { x: 1 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 };  // (60, 180)
const IFRAME_WOLF   = { x: 3 * CELL + CELL / 2, y: IFRAME_PLAYER.y };       // (140, 180)
const IFRAME_SLIME  = { x: 4 * CELL + CELL / 2, y: IFRAME_PLAYER.y };       // (180, 180)
// Player dodges east (toward both enemies). Iframes last 0.4s (ticks 60–84 at 60 Hz).
const IFRAME_DODGE_TARGET = { x: 800, y: IFRAME_PLAYER.y };
// Tick at which the dodge fires. Wolf lunge starts ~tick 61; slime projectile arrives ~tick 70.
const IFRAME_DODGE_TICK = 60;

/**
 * Dodge iFrame protection: player dodges east through a wolf charge and a slime projectile;
 * iframes must prevent both attacks from dealing damage.
 *
 * Timeline (60 Hz):
 *  tick  1 — wolf DarkWolfBite queued; slime SlimeShot queued toward player start position
 *  tick  1 — wolf windup begins (1 s), slime windup begins (0.5 s)
 *  tick 31 — slime projectile launches, heads west toward player at 75 px/s
 *  tick 60 — player casts Dodge east (iframes: tick 60–84)
 *  tick 61 — wolf lunge starts; wolf and dodging player meet ~tick 68 → iframes block
 *  tick ~70 — projectile and player meet → iframes block
 *  tick 85 — wolf lunge ends; player iframes ended at tick 84
 */
export const dodgeIFrameProtectionScenario: ScenarioDefinition = {
    id: 'dodge_iframe_protection',
    title: 'Dodge: iframes block wolf charge and slime projectile',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 5000,

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: IFRAME_PLAYER.x,
            y: IFRAME_PLAYER.y,
            abilities: ['0101'],
        });
        player.attachResource(new Movement(), engine.eventBus);

        // Wolf 80 px east — within DarkWolfBite range (100 px). Lunge sweeps through player
        // during the dodge iframe window.
        const wolf = createDarkWolfUnit(
            {
                id: 'dodge_iframe_wolf',
                x: IFRAME_WOLF.x,
                y: IFRAME_WOLF.y,
                teamId: 'enemy',
                ownerId: 'ai',
                name: 'Wolf',
                abilities: ['0003'],
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(wolf);
        engine.addUnit(wolf, 'initialGameSpawn');

        // Slime 120 px east — fires a slow projectile (75 px/s) that arrives during iframes.
        const slime = createUnitFromSpawnConfig(
            {
                id: 'dodge_iframe_slime',
                characterId: 'slime',
                name: 'Slime',
                x: IFRAME_SLIME.x,
                y: IFRAME_SLIME.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ['0001'],
                aiSettings: { minRange: 0, maxRange: 200 },
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(slime);
        engine.addUnit(slime, 'initialGameSpawn');

        engine.state.orderMgr.queueOrder(1, {
            unitId: wolf.id,
            abilityId: '0003',
            targets: [{ type: 'unit', unitId: player.id }],
        });

        engine.state.orderMgr.queueOrder(1, {
            unitId: slime.id,
            abilityId: '0001',
            targets: [{ type: 'pixel', position: IFRAME_PLAYER }],
        });

        // Dodge fires at tick 60, cancelling the wait and granting iframes for 0.4 s.
        engine.state.orderMgr.queueOrder(IFRAME_DODGE_TICK, {
            unitId: player.id,
            abilityId: '0101',
            targets: [{ type: 'pixel', position: IFRAME_DODGE_TARGET }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        // Slime projectile arrives ~t=1.15s (tick 69); wolf lunge covers ticks 61-85.
        // Check at t≥1.2s so both attacks have been attempted before asserting no damage.
        if (!player || engine.gameTime < 1.2) return false;
        const movement = player.getResource('movement_points');
        const movementConsumed = movement !== undefined && movement.current === 1;
        return player.hp === player.maxHp && movementConsumed;
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const wolf = engine.getUnit('dodge_iframe_wolf');
        const slime = engine.getUnit('dodge_iframe_slime');
        const movement = player?.getResource('movement');
        return (
            `player hp=${player?.hp}/${player?.maxHp} movement=${movement?.current}/${movement?.max} t=${engine.gameTime.toFixed(2)} ` +
            `wolf active=[${wolf?.activeAbilities.map((a) => a.abilityId).join(',') ?? '—'}] ` +
            `slime active=[${slime?.activeAbilities.map((a) => a.abilityId).join(',') ?? '—'}]`
        );
    },
};

// ─── Dodge iFrame vs Thornbinder Bramble ─────────────────────────────────────

/** Matches Dodge `iframe` timing window (0101Ability). */
const DODGE_IFRAME_DURATION_SEC = 0.4;
/**
 * Keep caster→aim distance well under max so impact lands inside the dodge window.
 * Flight time is offset / {@link THORN_PROJECTILE_SPEED}.
 */
const TB_IFRAME_CASTER_OFFSET_X = 100;
/** Short dodge so the player stays in the impact circle and the same grid cell (no thorn enter). */
const TB_IFRAME_DODGE_OFFSET_X = 12;
const TB_IFRAME_PLAYER = { x: 3 * CELL + CELL / 2, y: 4 * CELL + CELL / 2 }; // (140, 180)
const TB_IFRAME_CASTER = {
    x: TB_IFRAME_PLAYER.x - TB_IFRAME_CASTER_OFFSET_X,
    y: TB_IFRAME_PLAYER.y,
};
const TB_IFRAME_DODGE_TARGET = {
    x: TB_IFRAME_PLAYER.x + TB_IFRAME_DODGE_OFFSET_X,
    y: TB_IFRAME_PLAYER.y,
};
/** Thornbinder cast tick (60 Hz). */
const TB_IFRAME_CAST_TICK = 1;
const TB_IFRAME_CAST_START_SEC = TB_IFRAME_CAST_TICK / 60;
const TB_IFRAME_FLIGHT_SEC = TB_IFRAME_CASTER_OFFSET_X / THORN_PROJECTILE_SPEED;
const TB_IFRAME_IMPACT_SEC = TB_IFRAME_CAST_START_SEC + THORNBINDER_LOCK_TIME + TB_IFRAME_FLIGHT_SEC;
/** Dodge so iframes cover impact (start ~0.25s before the spike lands). */
const TB_IFRAME_DODGE_LEAD_SEC = 0.25;
const TB_IFRAME_DODGE_TICK = Math.floor((TB_IFRAME_IMPACT_SEC - TB_IFRAME_DODGE_LEAD_SEC) * 60);
/** Assert after impact and after the dodge window ends (DoT milestone is later at 2.5s). */
const TB_IFRAME_ASSERT_AFTER_SEC =
    TB_IFRAME_IMPACT_SEC + DODGE_IFRAME_DURATION_SEC * 0.25;

/**
 * Dodge vs Thornbinder Bramble: player Dodges so iframes overlap the bramble impact;
 * combat damage + knockback must not apply (env thorns are out of scope for this assert).
 *
 * Timeline (60 Hz, approximate; LOCK_TIME + flight-driven):
 *  tick  1 — Thornbinder queues Bramble at player start
 *  lock tick — projectile launches (LOCK_TIME)
 *  dodge tick — player Dodges a short step east (iframes ~0.4s); stays in impact radius
 *  shortly after — impact during iframes → no HP loss, no knockback, Dodge completes
 */
export const dodgeIFrameVsThornbinderScenario: ScenarioDefinition = {
    id: 'dodge_iframe_vs_thornbinder',
    title: 'Dodge: iframes block Thornbinder Bramble impact',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: Math.ceil((TB_IFRAME_ASSERT_AFTER_SEC + 0.75) * 1000),

    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 10,
            gridH: 8,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });

        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: TB_IFRAME_PLAYER.x,
            y: TB_IFRAME_PLAYER.y,
            abilities: ['0101'],
        });
        player.attachResource(new Movement(), engine.eventBus);
        player.unitAITreeId = 'static_test_no_ai';

        const binder = createUnitFromSpawnConfig(
            {
                id: 'dodge_iframe_thornbinder',
                characterId: 'thornbinder',
                name: 'Thornbinder',
                x: TB_IFRAME_CASTER.x,
                y: TB_IFRAME_CASTER.y,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: [THORNBINDER_ABILITY_ID],
            },
            engine.eventBus,
        );
        initializeAbilityRuntimeForUnit(binder);
        binder.unitAITreeId = 'static_test_no_ai';
        engine.addUnit(binder, 'initialGameSpawn');

        engine.state.orderMgr.queueOrder(TB_IFRAME_CAST_TICK, {
            unitId: binder.id,
            abilityId: THORNBINDER_ABILITY_ID,
            targets: [{ type: 'pixel', position: { ...TB_IFRAME_PLAYER } }],
        });

        engine.state.orderMgr.queueOrder(TB_IFRAME_DODGE_TICK, {
            unitId: player.id,
            abilityId: '0101',
            targets: [{ type: 'pixel', position: { ...TB_IFRAME_DODGE_TARGET } }],
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const player = engine.getLocalPlayerUnit();
        if (!player || engine.gameTime < TB_IFRAME_ASSERT_AFTER_SEC) return false;
        const movement = player.getResource('movement_points');
        const movementConsumed = movement !== undefined && movement.current === 1;
        const dodgeDone = !player.activeAbilities.some((a) => a.abilityId === '0101');
        return (
            player.hp === player.maxHp &&
            player.knockback === null &&
            movementConsumed &&
            dodgeDone
        );
    },

    failureMessage(engine) {
        const player = engine.getLocalPlayerUnit();
        const binder = engine.getUnit('dodge_iframe_thornbinder');
        const movement = player?.getResource('movement_points');
        return (
            `player hp=${player?.hp}/${player?.maxHp} knockback=${player?.knockback ? 'yes' : 'no'} ` +
            `movement=${movement?.current}/${movement?.max} dodgeActive=${Boolean(
                player?.activeAbilities.some((a) => a.abilityId === '0101'),
            )} t=${engine.gameTime.toFixed(2)} ` +
            `binder active=[${binder?.activeAbilities.map((a) => a.abilityId).join(',') ?? '—'}]`
        );
    },
};

// ─── Enemy route shape (pathfinding overhaul) ────────────────────────────────

/** Stop measuring once the chaser is this close (it holds at melee range rather than reaching the cell). */
const ROUTE_MEASURE_STOP_DIST = 2 * CELL;

interface RouteTrack {
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    travelled: number;
    maxDeviation: number;
    /** Length of the smoothed shortest route from the start to the player (0 until computed). */
    referenceLength: number;
    arrived: boolean;
}

/** Per-engine tracking, updated from `assertPass` (the runner calls it every tick). */
const routeTracks = new WeakMap<GameEngine, RouteTrack>();

/** A melee chaser on the `hunt` tree: pursues the player relentlessly, no perception limit. */
function spawnRouteChaser(engine: GameEngine, id: string, col: number, row: number): void {
    const chaser = createUnitFromSpawnConfig(
        {
            id,
            characterId: 'swarmling',
            name: 'Chaser',
            x: col * CELL + CELL / 2,
            y: row * CELL + CELL / 2,
            teamId: 'enemy',
            ownerId: 'ai',
            abilities: [],
            unitAITreeId: 'hunt',
            aiSettings: { minRange: 0, maxRange: 60 },
        },
        engine.eventBus,
    );
    initializeAbilityRuntimeForUnit(chaser);
    engine.addUnit(chaser, 'initialGameSpawn');
}

/** Keep the stationary player "busy" so the real-time sim keeps running for the whole scenario. */
function queuePlayerWaits(engine: GameEngine, untilTick: number): void {
    const player = engine.getLocalPlayerUnit()!;
    for (let tick = 90; tick <= untilTick; tick += 90) {
        engine.state.orderMgr.queueOrder(tick, { unitId: player.id, abilityId: 'wait', targets: [] });
    }
}

/** Advance the route tracking for `enemyId` by one tick and return it. */
function trackRoute(engine: GameEngine, enemyId: string): RouteTrack | null {
    const enemy = engine.getUnit(enemyId);
    const player = engine.getLocalPlayerUnit();
    if (!enemy || !player) return null;

    let track = routeTracks.get(engine);
    if (!track) {
        track = {
            startX: enemy.x,
            startY: enemy.y,
            lastX: enemy.x,
            lastY: enemy.y,
            travelled: 0,
            maxDeviation: 0,
            referenceLength: 0,
            arrived: false,
        };
        const tm = engine.terrainManager!;
        const goal = tm.grid.worldToGrid(player.x, player.y);
        const route = tm.pathQuery.findPath(enemy.x, enemy.y, goal.col, goal.row, 'enemy', 0) ?? [];
        let x = enemy.x;
        let y = enemy.y;
        for (const wp of route) {
            const w = tm.grid.gridToWorld(wp.col, wp.row);
            track.referenceLength += Math.hypot(w.x - x, w.y - y);
            x = w.x;
            y = w.y;
        }
        routeTracks.set(engine, track);
    }
    if (track.arrived) return track;

    track.travelled += Math.hypot(enemy.x - track.lastX, enemy.y - track.lastY);
    track.lastX = enemy.x;
    track.lastY = enemy.y;

    // Perpendicular distance from the straight start -> player line.
    const lx = player.x - track.startX;
    const ly = player.y - track.startY;
    const len = Math.hypot(lx, ly);
    if (len > 0) {
        const deviation = Math.abs((enemy.x - track.startX) * ly - (enemy.y - track.startY) * lx) / len;
        if (deviation > track.maxDeviation) track.maxDeviation = deviation;
    }

    if (Math.hypot(enemy.x - player.x, enemy.y - player.y) <= ROUTE_MEASURE_STOP_DIST) track.arrived = true;
    return track;
}

function describeRoute(engine: GameEngine): string {
    const t = routeTracks.get(engine);
    if (!t) return 'no route tracked';
    return (
        `arrived=${t.arrived} travelled=${t.travelled.toFixed(1)} reference=${t.referenceLength.toFixed(1)} `
        + `maxDeviation=${t.maxDeviation.toFixed(1)} tick=${engine.gameTick}`
    );
}

const ROUTE_OPEN_ENEMY_ID = 'path_enemy_straight';
/** Open ground: the chaser may not stray further than this from the straight line to the player. */
const ROUTE_OPEN_MAX_DEVIATION = 0.75 * CELL;

/** Enemy chasing across open ground at an off-axis angle walks a straight line (no staircase). */
export const pathOpenFieldStraightScenario: ScenarioDefinition = {
    id: 'path_open_field_straight',
    title: 'Enemy route: straight line across open ground',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 4 * CELL + CELL / 2,
            y: 9 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        configurePathTestPlayer(engine);
        // 13 columns and 5 rows away: neither axis-aligned nor a pure diagonal.
        spawnRouteChaser(engine, ROUTE_OPEN_ENEMY_ID, 17, 4);
        queuePlayerWaits(engine, 1200);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackRoute(engine, ROUTE_OPEN_ENEMY_ID);
        return !!track && track.arrived && track.maxDeviation < ROUTE_OPEN_MAX_DEVIATION;
    },

    failureMessage(engine) {
        return `expected arrival with maxDeviation < ${ROUTE_OPEN_MAX_DEVIATION}; ${describeRoute(engine)}`;
    },

    describeState: describeRoute,
};

const ROUTE_CORNER_ENEMY_ID = 'path_enemy_corner';
/** Walked distance may exceed the smoothed shortest route by at most this factor. */
const ROUTE_CORNER_MAX_RATIO = 1.25;

/** Enemy behind a wall rounds its end once and comes straight in (no U-shape, no backtracking). */
export const pathCornerNoBacktrackScenario: ScenarioDefinition = {
    id: 'path_corner_no_backtrack',
    title: 'Enemy route: one bend round a wall, no backtracking',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 24, gridH: 16, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        // Wall down column 10 from the top edge to row 10: the only way past is under its end.
        const tm = engine.terrainManager!;
        for (let row = 0; row <= 10; row++) tm.grid.set(10, row, TerrainType.Rock);
        tm.clearPathCache();

        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 4 * CELL + CELL / 2,
            y: 5 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        configurePathTestPlayer(engine);
        spawnRouteChaser(engine, ROUTE_CORNER_ENEMY_ID, 16, 5);
        queuePlayerWaits(engine, 1200);
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackRoute(engine, ROUTE_CORNER_ENEMY_ID);
        if (!track || !track.arrived || track.referenceLength <= 0) return false;
        // The reference runs to the player's cell; measuring stops ROUTE_MEASURE_STOP_DIST short of it.
        return track.travelled <= ROUTE_CORNER_MAX_RATIO * track.referenceLength;
    },

    failureMessage(engine) {
        return `expected arrival with travelled <= ${ROUTE_CORNER_MAX_RATIO} x reference; ${describeRoute(engine)}`;
    },

    describeState: describeRoute,
};

// ─── Group spreading: units navigate a wide corner in separate lanes ────────

const PATH_GROUP_SPREADS_PLAYER_ID = 'path_group_player';
const PATH_GROUP_SPREADS_CHASERS = 'path_group_chaser';

interface GroupSpreadTrack {
    /** Chaser id -> row of the cell it was in on the first tick it reached column 14. */
    crossingRowById: Map<string, number>;
}

const GROUP_SPREADS_COUNT = 12;
const GROUP_SPREADS_MIN_DISTINCT_ROWS = 3;
const groupSpreadsTracks = new WeakMap<GameEngine, GroupSpreadTrack>();

function trackGroupSpreads(engine: GameEngine): GroupSpreadTrack | null {
    const track = groupSpreadsTracks.get(engine);
    if (!track) return null;
    for (let i = 0; i < GROUP_SPREADS_COUNT; i++) {
        const id = `${PATH_GROUP_SPREADS_CHASERS}_${i}`;
        if (track.crossingRowById.has(id)) continue;
        const chaser = engine.getUnit(id);
        if (!chaser?.isAlive()) continue;
        if (chaser.x >= 14 * CELL) track.crossingRowById.set(id, Math.floor(chaser.y / CELL));
    }
    return track;
}

function describeGroupSpreads(engine: GameEngine): string {
    const track = groupSpreadsTracks.get(engine);
    if (!track) return 'no track';
    const rows = [...track.crossingRowById.values()];
    return `crossed=${rows.length}/${GROUP_SPREADS_COUNT} crossingRows=[${rows.join(',')}] `
        + `distinct=${new Set(rows).size} (need ${GROUP_SPREADS_MIN_DISTINCT_ROWS}) tick=${engine.gameTick}`;
}

export const pathGroupSpreadsScenario: ScenarioDefinition = {
    id: 'path_group_spreads',
    title: 'Group spreading: units fan out at a corner',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 30000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 30, gridH: 18, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const tm = engine.terrainManager!;

        // Wall down column 14 from row 0 to row 9; gap below for passage.
        for (let row = 0; row <= 9; row++) {
            tm.grid.set(14, row, TerrainType.Rock);
        }
        tm.clearPathCache();

        // Player at (24, 4), stationary.
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 24 * CELL + CELL / 2,
            y: 4 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        player.id = PATH_GROUP_SPREADS_PLAYER_ID;
        configurePathTestPlayer(engine);
        queuePlayerWaits(engine, 1200);

        // 12 chasers in a 3×4 block at columns 3–5, rows 2–5, with moveJitter spread.
        let idx = 0;
        for (let col = 3; col <= 5; col++) {
            for (let row = 2; row <= 5; row++) {
                const chaserId = `${PATH_GROUP_SPREADS_CHASERS}_${idx}`;
                spawnRouteChaser(engine, chaserId, col, row);
                const chaser = engine.getUnit(chaserId)!;
                // Set moveJitter deterministically: idx / 12 + 0.04, so lanes spread from 0.04 to 0.96.
                chaser.moveJitter = idx / 12 + 0.04;
                idx++;
            }
        }

        groupSpreadsTracks.set(engine, { crossingRowById: new Map() });

        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackGroupSpreads(engine);
        if (!track || track.crossingRowById.size < GROUP_SPREADS_COUNT) return false;
        return new Set(track.crossingRowById.values()).size >= GROUP_SPREADS_MIN_DISTINCT_ROWS;
    },

    failureMessage: describeGroupSpreads,
    describeState: describeGroupSpreads,
};

// ─── Chokepoint slide: units queue and slide through a one-cell gap ────────

const PATH_CHOKEPOINT_PLAYER_ID = 'path_chokepoint_player';
const PATH_CHOKEPOINT_CHASERS = 'path_chokepoint_chaser';

interface ChokePointTrack {
    firstViolation: { col: number; row: number } | null;
    nearPlayer: number;
}

const chokePointTracks = new WeakMap<GameEngine, ChokePointTrack>();

function trackChokePoint(engine: GameEngine): ChokePointTrack | null {
    const player = engine.getLocalPlayerUnit();
    if (!player) return null;

    let track = chokePointTracks.get(engine);
    if (!track) {
        track = { firstViolation: null, nearPlayer: 0 };
        chokePointTracks.set(engine, track);
    }

    // Check for units in impassable cells.
    const nav = engine.terrainManager!.nav;
    for (let i = 0; i < 10; i++) {
        const chaser = engine.getUnit(`${PATH_CHOKEPOINT_CHASERS}_${i}`);
        if (!chaser || !chaser.isAlive()) continue;

        const col = Math.floor(chaser.x / CELL);
        const row = Math.floor(chaser.y / CELL);
        if (!nav.isPassable('enemy', col, row) && !track.firstViolation) {
            track.firstViolation = { col, row };
        }
    }

    // Count units within 3 cells of the player.
    track.nearPlayer = 0;
    for (let i = 0; i < 10; i++) {
        const chaser = engine.getUnit(`${PATH_CHOKEPOINT_CHASERS}_${i}`);
        if (!chaser || !chaser.isAlive()) continue;
        const dist = Math.max(Math.abs(chaser.x - player.x), Math.abs(chaser.y - player.y)) / CELL;
        if (dist <= 3) track.nearPlayer++;
    }

    return track;
}

export const pathChokePointSlideScenario: ScenarioDefinition = {
    id: 'path_chokepoint_slide',
    title: 'Chokepoint: units queue and slide through a narrow gap',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 30000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 30, gridH: 15, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const tm = engine.terrainManager!;

        // Wall down column 14, except a one-cell gap at row 7.
        for (let row = 0; row < 15; row++) {
            if (row !== 7) tm.grid.set(14, row, TerrainType.Rock);
        }
        tm.clearPathCache();

        // Player at (24, 7) in the gap row.
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 24 * CELL + CELL / 2,
            y: 7 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        player.id = PATH_CHOKEPOINT_PLAYER_ID;
        configurePathTestPlayer(engine);
        queuePlayerWaits(engine, 1200);

        // 10 chasers at columns 3–4, rows 4–8.
        let idx = 0;
        for (let col = 3; col <= 4; col++) {
            for (let row = 4; row <= 8; row++) {
                const chaserId = `${PATH_CHOKEPOINT_CHASERS}_${idx}`;
                spawnRouteChaser(engine, chaserId, col, row);
                idx++;
            }
        }

        chokePointTracks.set(engine, { firstViolation: null, nearPlayer: 0 });
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackChokePoint(engine);
        // At least 8 of 10 squeezed through the gap, and nobody was ever pushed into rock.
        return !!track && track.nearPlayer >= 8 && track.firstViolation === null;
    },

    failureMessage(engine) {
        const track = trackChokePoint(engine);
        if (!track) return 'no track';
        const violation = track.firstViolation ? `impassable at (${track.firstViolation.col},${track.firstViolation.row})` : 'none';
        return `nearPlayer=${track.nearPlayer}/10 (need ≥8) violation=${violation}`;
    },

    describeState(engine) {
        const track = trackChokePoint(engine);
        return track ? `nearPlayer=${track.nearPlayer} violation=${track.firstViolation ? `(${track.firstViolation.col},${track.firstViolation.row})` : 'none'} tick=${engine.gameTick}` : 'no track';
    },
};

// ─── Terrain change reroute ───────────────────────────────────────────────

const PATH_TERRAIN_CHANGE_PLAYER_ID = 'path_tc_player';
const PATH_TERRAIN_CHANGE_CHASER_ID = 'path_tc_chaser';

interface TerrainChangeTrack {
    detoured: boolean;
    reopened: boolean;
    violation: boolean;
    arrived: boolean;
}

const terrainChangeTracks = new WeakMap<GameEngine, TerrainChangeTrack>();

function trackTerrainChange(engine: GameEngine): TerrainChangeTrack | null {
    const chaser = engine.getUnit(PATH_TERRAIN_CHANGE_CHASER_ID);
    const player = engine.getLocalPlayerUnit();
    if (!chaser || !player) return null;

    let track = terrainChangeTracks.get(engine);
    if (!track) {
        track = { detoured: false, reopened: false, violation: false, arrived: false };
        terrainChangeTracks.set(engine, track);
    }

    // At tick 40, create the wall.
    if (engine.gameTick === 40) {
        const tm = engine.terrainManager!;
        for (let row = 3; row <= 9; row++) {
            tm.createOrMarkRock(12, row);
        }
    }

    // Check if path has more than one waypoint (detoured).
    if (engine.gameTick > 40 && chaser.movement && chaser.movement.path.length > 1) {
        track.detoured = true;
    }

    // At tick 160, destroy the wall.
    if (engine.gameTick === 160) {
        const tm = engine.terrainManager!;
        for (let row = 3; row <= 9; row++) {
            tm.damageRock(12, row, 10000);
        }
    }

    // Check if path became single waypoint after wall destruction (within 60 ticks, if chaser hasn't passed).
    if (engine.gameTick > 160 && engine.gameTick <= 220) {
        if (chaser.x < 12 * CELL) {
            // Chaser hasn't passed the wall yet.
            if (chaser.movement && chaser.movement.path.length === 1) {
                track.reopened = true;
            }
        } else {
            // Chaser already past; mark as satisfied.
            track.reopened = true;
        }
    }

    // Check for impassable violations.
    const nav = engine.terrainManager!.nav;
    const col = Math.floor(chaser.x / CELL);
    const row = Math.floor(chaser.y / CELL);
    if (!nav.isPassable('enemy', col, row)) {
        track.violation = true;
    }
    if (Math.hypot(chaser.x - player.x, chaser.y - player.y) <= 2 * CELL) track.arrived = true;

    return track;
}

export const pathTerrainChangeRerouteScenario: ScenarioDefinition = {
    id: 'path_terrain_change_reroute',
    title: 'Terrain change: units reroute when blocked, shortcut when reopened',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 30000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 26, gridH: 12, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });

        // Player at (22, 6).
        const player = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 22 * CELL + CELL / 2,
            y: 6 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        player.id = PATH_TERRAIN_CHANGE_PLAYER_ID;
        configurePathTestPlayer(engine);
        queuePlayerWaits(engine, 1200);

        // One chaser at (3, 6).
        spawnRouteChaser(engine, PATH_TERRAIN_CHANGE_CHASER_ID, 3, 6);

        terrainChangeTracks.set(engine, { detoured: false, reopened: false, violation: false, arrived: false });
        return engine;
    },

    getInitialOrders(engine) {
        const player = engine.getLocalPlayerUnit()!;
        return [{ unitId: player.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackTerrainChange(engine);
        return !!track && track.detoured && track.reopened && !track.violation && track.arrived;
    },

    failureMessage(engine) {
        const track = trackTerrainChange(engine);
        if (!track) return 'no track';
        return `detoured=${track.detoured} reopened=${track.reopened} violation=${track.violation} arrived=${track.arrived} tick=${engine.gameTick}`;
    },

    describeState(engine) {
        const track = trackTerrainChange(engine);
        return track ? `detoured=${track.detoured} reopened=${track.reopened} violation=${track.violation} arrived=${track.arrived} tick=${engine.gameTick}` : 'no track';
    },
};

// ─── Stress test: 200 chasers on a map with obstacles ──────────────────────

const PATH_STRESS_PLAYER_1_ID = 'path_stress_player_1';
const PATH_STRESS_PLAYER_2_ID = 'path_stress_player_2';
const PATH_STRESS_CHASER = 'path_stress_chaser';

interface StressTrack {
    initialMeanDist: number;
    currentMeanDist: number;
    maxPlansPerTick: number;
    totalPlans: number;
    violation: boolean;
}

const stressTracks = new WeakMap<GameEngine, StressTrack>();

const STRESS_CHASER_COUNT = 200;
const STRESS_MIN_TICKS = 900;
/**
 * Required progress: the mean distance to the nearest player must shrink by at least this share of
 * the furthest a chaser could have walked (speed × time). The rest is lost to detours round walls,
 * chokepoints and crowding at the players.
 */
const STRESS_MIN_PROGRESS_SHARE = 0.5;

function stressMeanDistance(engine: GameEngine): number {
    const p1 = engine.getUnit(PATH_STRESS_PLAYER_1_ID)!;
    const p2 = engine.getUnit(PATH_STRESS_PLAYER_2_ID)!;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < STRESS_CHASER_COUNT; i++) {
        const c = engine.getUnit(`${PATH_STRESS_CHASER}_${i}`);
        if (!c?.isAlive()) continue;
        sum += Math.min(Math.hypot(c.x - p1.x, c.y - p1.y), Math.hypot(c.x - p2.x, c.y - p2.y));
        count++;
    }
    return count > 0 ? sum / count : 0;
}

/** Advance stress tracking by one tick (called from assertPass every tick). */
function trackStress(engine: GameEngine): StressTrack | null {
    const track = stressTracks.get(engine);
    if (!track) return null;
    track.currentMeanDist = stressMeanDistance(engine);

    const pm = engine.pathfindingManager;
    track.maxPlansPerTick = Math.max(track.maxPlansPerTick, pm.lastTickPlanCount);
    track.totalPlans += pm.lastTickPlanCount;

    const nav = engine.terrainManager!.nav;
    for (let i = 0; i < STRESS_CHASER_COUNT; i++) {
        const c = engine.getUnit(`${PATH_STRESS_CHASER}_${i}`);
        if (!c?.isAlive()) continue;
        if (!nav.isPassable('enemy', Math.floor(c.x / CELL), Math.floor(c.y / CELL))) track.violation = true;
    }
    return track;
}

function stressRequiredProgress(engine: GameEngine): number {
    const chaser = engine.getUnit(`${PATH_STRESS_CHASER}_0`);
    const speed = chaser?.speed ?? 0;
    return STRESS_MIN_PROGRESS_SHARE * speed * (engine.gameTick / 60);
}

function describeStress(engine: GameEngine): string {
    const track = stressTracks.get(engine);
    if (!track) return 'no track';
    return `initialMeanDist=${track.initialMeanDist.toFixed(0)} currentMeanDist=${track.currentMeanDist.toFixed(0)} `
        + `progress=${(track.initialMeanDist - track.currentMeanDist).toFixed(0)}px (need >= ${stressRequiredProgress(engine).toFixed(0)}) `
        + `maxPlansPerTick=${track.maxPlansPerTick} totalPlans=${track.totalPlans} violation=${track.violation} `
        + `tick=${engine.gameTick}`;
}

export const pathStress200Scenario: ScenarioDefinition = {
    id: 'path_stress_200',
    title: 'Stress: 200 chasers navigate a map with obstacles',
    category: 'general',
    generalSection: 'Movement',
    maxDurationMs: 20000,

    buildEngine() {
        const engine = buildTinyBattleEngine({ gridW: 60, gridH: 40, localPlayerId: TINY_BATTLE_PLAYER_ID, grass: true });
        const tm = engine.terrainManager!;

        // Create obstacles: rocks at several locations.
        for (let row = 0; row <= 25; row++) tm.grid.set(20, row, TerrainType.Rock);
        for (let row = 15; row <= 39; row++) tm.grid.set(40, row, TerrainType.Rock);
        for (let col = 30; col <= 33; col++) {
            for (let row = 8; row <= 11; row++) {
                tm.grid.set(col, row, TerrainType.Rock);
            }
        }
        tm.clearPathCache();

        // Two stationary players at (55, 8) and (55, 32).
        const player1 = spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x: 55 * CELL + CELL / 2,
            y: 8 * CELL + CELL / 2,
            abilities: ['0120'],
        });
        player1.id = PATH_STRESS_PLAYER_1_ID;

        const player2 = spawnTinyPlayerUnit(engine, {
            playerId: 'enemy',
            x: 55 * CELL + CELL / 2,
            y: 32 * CELL + CELL / 2,
            abilities: [],
        });
        player2.id = PATH_STRESS_PLAYER_2_ID;
        player2.teamId = 'player';
        player2.ownerId = 'ai';
        player2.unitAITreeId = 'static_test_no_ai';

        configurePathTestPlayer(engine);
        queuePlayerWaits(engine, 1200);

        // 200 chasers on a checkerboard over columns 1–12, rows 1–38 (no rock in that area).
        let idx = 0;
        for (let col = 1; col <= 12 && idx < STRESS_CHASER_COUNT; col++) {
            for (let row = 1; row <= 38 && idx < STRESS_CHASER_COUNT; row++) {
                if ((col + row) % 2 !== 0) continue;
                spawnRouteChaser(engine, `${PATH_STRESS_CHASER}_${idx}`, col, row);
                idx++;
            }
        }

        const initialMeanDist = stressMeanDistance(engine);
        stressTracks.set(engine, {
            initialMeanDist,
            currentMeanDist: initialMeanDist,
            maxPlansPerTick: 0,
            totalPlans: 0,
            violation: false,
        });

        return engine;
    },

    getInitialOrders(engine) {
        const player1 = engine.getUnit(PATH_STRESS_PLAYER_1_ID)!;
        return [{ unitId: player1.id, abilityId: 'wait', targets: [] }];
    },

    assertPass(engine) {
        const track = trackStress(engine);
        if (!track || track.violation || engine.gameTick < STRESS_MIN_TICKS) return false;
        return track.initialMeanDist - track.currentMeanDist >= stressRequiredProgress(engine);
    },

    failureMessage: describeStress,
    describeState: describeStress,
};
