import type { ScenarioDefinition } from '../../types';
import type { GameEngine } from '../../../game/GameEngine';
import {
    buildTinyBattleEngine,
    MOVE_ONLY_ABILITY_ID,
    spawnTinyPlayerUnit,
    TINY_BATTLE_PLAYER_ID,
} from '../../harness/buildTinyBattleEngine';
import { TerrainType } from '../../../terrain/TerrainType';

function assertPlayerNear(engine: GameEngine, wx: number, wy: number, tol: number): boolean {
    const u = engine.getLocalPlayerUnit();
    if (!u) return false;
    const dx = u.x - wx;
    const dy = u.y - wy;
    return Math.hypot(dx, dy) <= tol;
}

/** Long straight-line grid move across open grass. */
export const pathStraightMoveScenario: ScenarioDefinition = {
    id: 'path_straight_move',
    title: 'Straight grid path completes',
    category: 'general',
    maxDurationMs: 4000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 16,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const tm = engine.terrainManager!;
        const { x, y } = tm.grid.gridToWorld(1, 5);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x,
            y,
            abilities: ['0102'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(1, 5, 11, 5);
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        if (!u) return false;
        const tm = engine.terrainManager!;
        const goal = tm.grid.gridToWorld(11, 5);
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
    maxDurationMs: 5000,
    buildEngine() {
        const engine = buildTinyBattleEngine({
            gridW: 14,
            gridH: 10,
            localPlayerId: TINY_BATTLE_PLAYER_ID,
            grass: true,
        });
        const tm = engine.terrainManager!;
        for (let c = 4; c <= 8; c++) {
            tm.grid.set(c, 5, TerrainType.Rock);
        }
        const { x, y } = tm.grid.gridToWorld(1, 5);
        spawnTinyPlayerUnit(engine, {
            playerId: TINY_BATTLE_PLAYER_ID,
            x,
            y,
            abilities: ['0102'],
        });
        return engine;
    },
    getInitialOrders(engine) {
        const tm = engine.terrainManager!;
        const u = engine.getLocalPlayerUnit()!;
        const path = tm.findGridPath(1, 5, 12, 5);
        if (!path) return [];
        return [{ unitId: u.id, abilityId: MOVE_ONLY_ABILITY_ID, targets: [], movePath: path }];
    },
    assertPass(engine) {
        const u = engine.getLocalPlayerUnit();
        if (!u) return false;
        const tm = engine.terrainManager!;
        const goal = tm.grid.gridToWorld(12, 5);
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
            abilities: ['0102'],
        });
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
