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

/** Path scenarios only: no AI tree / retrigger so scripted move orders are not overwritten. */
function configurePathTestPlayer(engine: GameEngine): void {
    const u = engine.getLocalPlayerUnit();
    if (!u) return;
    u.unitAITreeId = 'static_test_no_ai';
    u.pathfindingRetriggerOffset = 0;
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
        const movement = player.getResource('movement');
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
