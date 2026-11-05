/**
 * Iron Warden kit on a full engine tick: the hook reels a distant enemy in (and walls stop it), the
 * slam crushes what is in its disc, Bulwark blocks the front only, the AI picks the right tool by
 * range, and Shieldbreak takes Bulwark away below the threshold.
 */
import { describe, expect, it } from 'vitest';
import { GameEngine } from '../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../game/GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { createUnitFromSpawnConfig } from '../../game/units';
import type { Unit } from '../../game/units/Unit';
import { executeUnitAbility } from '../../game/units/unitAbilityLifecycle';
import { getAbility } from '../../abilities/AbilityRegistry';
import { AbilityState } from '../../abilities/Ability';
import { canAttackBeBlocked } from '../../abilities/blockingHelpers';
import { pickBestAbility } from '../../game/units/unitAI/utils';
import { resolveParallelOrderPause } from '../../testing/runner/SimulationRunner';
import type { AIContext } from '../../game/units/unitAI/types';
import { CARD_DEF_MAP } from '../index';
import { getBestiaryUnitIds, getUnitDefEntry } from '../../game/units/unit_defs/unitDef';
import { ENEMY_IRON_WARDEN, IRON_WARDEN_SHIELDBREAK_THRESHOLD } from '../../constants/enemyConstants';
import { BULWARK_ABILITY_ID, EXECUTION_SLAM_ABILITY_ID, GAOLERS_HOOK_ABILITY_ID, HOOK_REEL_STANDOFF_PX } from './wardenConstants';
import { GAOLERS_HOOK_DAMAGE, GAOLERS_HOOK_RANGE_PX, GaolersHookAbility_1201 } from './1201_GaolersHook/1201Ability';
import {
    EXECUTION_SLAM_DAMAGE,
    EXECUTION_SLAM_OFFSET_PX,
    EXECUTION_SLAM_RADIUS_PX,
    EXECUTION_SLAM_REACH_PX,
    EXECUTION_SLAM_WINDUP_SEC,
    ExecutionSlamAbility_1202,
} from './1202_ExecutionSlam/1202Ability';
import { BULWARK_DURATION_SEC, BulwarkAbility_1203 } from './1203_Bulwark/1203Ability';

const GRID = 16;
const ROW = 8;
const WARDEN_COL = 3;
const PLAYER_ID = 'p1';
const TICKS_PER_SEC = 60;

const centre = (cell: number) => (cell + 0.5) * CELL_SIZE;

function setupEngine(rockCells: Array<[number, number]> = []): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(GRID, GRID, CELL_SIZE, TerrainType.Grass);
    for (const [col, row] of rockCells) grid.set(col, row, TerrainType.Rock);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: PLAYER_ID, randomSeed: 1, terrainManager: new TerrainManager(grid), aiControllerId: null });
    engine.setMissionLightConfig(false, 0);
    return engine;
}

function addWarden(engine: GameEngine, x = centre(WARDEN_COL), y = centre(ROW)): Unit {
    const warden = createUnitFromSpawnConfig(
        { ...ENEMY_IRON_WARDEN, x, y, ownerId: 'ai', unitAITreeId: 'none' },
        engine.eventBus,
        engine,
    );
    engine.addUnit(warden, 'initialGameSpawn');
    return warden;
}

function addPlayer(engine: GameEngine, x: number, y = centre(ROW)): Unit {
    const player = createUnitFromSpawnConfig(
        { characterId: 'player', name: 'P', x, y, teamId: 'player', ownerId: PLAYER_ID, abilities: [] },
        engine.eventBus,
        engine,
    );
    engine.addUnit(player, 'initialGameSpawn');
    return player;
}

function cast(engine: GameEngine, unit: Unit, abilityId: string, at: { x: number; y: number }): void {
    executeUnitAbility(unit, getAbility(abilityId)!, [{ type: 'pixel', position: at }], engine);
}

/** Step whole ticks, answering any player-order pause with a pass so the sim keeps running. */
function stepTicks(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

function stepSeconds(engine: GameEngine, seconds: number): void {
    stepTicks(engine, Math.round(seconds * TICKS_PER_SEC));
}

const dist = (a: Unit, b: Unit) => Math.hypot(a.x - b.x, a.y - b.y);

function aiContext(engine: GameEngine): AIContext {
    return {
        gameTime: engine.gameTime,
        gameTick: engine.gameTick,
        getUnit: (id: string) => engine.getUnit(id),
        getUnits: () => engine.units,
        getSpecialTiles: () => [],
        generateRandomInteger: (min: number) => min,
    } as unknown as AIContext;
}

describe('Iron Warden registration', () => {
    it('registers all three abilities and cards, and lists them in the Bestiary', () => {
        for (const id of [GAOLERS_HOOK_ABILITY_ID, EXECUTION_SLAM_ABILITY_ID, BULWARK_ABILITY_ID]) {
            expect(getAbility(id)).toBeDefined();
            expect(CARD_DEF_MAP.get(id)).toBeDefined();
        }
        expect(getAbility(GAOLERS_HOOK_ABILITY_ID)).toBe(GaolersHookAbility_1201);
        expect(getAbility(EXECUTION_SLAM_ABILITY_ID)).toBe(ExecutionSlamAbility_1202);
        expect(getAbility(BULWARK_ABILITY_ID)).toBe(BulwarkAbility_1203);
        expect(ENEMY_IRON_WARDEN.abilities).toEqual([GAOLERS_HOOK_ABILITY_ID, EXECUTION_SLAM_ABILITY_ID, BULWARK_ABILITY_ID]);
        expect(getBestiaryUnitIds()).toContain('iron_warden');
        expect(getUnitDefEntry('iron_warden')!.hp!).toBeGreaterThan(getUnitDefEntry('husk')!.hp!);
    });

    it('lands a hooked victim inside the slam disc, so the hook sets up the slam', () => {
        const reelToBlastCentre = Math.abs(EXECUTION_SLAM_OFFSET_PX - HOOK_REEL_STANDOFF_PX);
        expect(reelToBlastCentre).toBeLessThan(EXECUTION_SLAM_RADIUS_PX);
    });
});

describe("Gaoler's Hook (1201)", () => {
    it('hits a distant enemy and reels it back to the Warden', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        const player = addPlayer(engine, centre(WARDEN_COL + 5));
        const startDist = dist(warden, player);
        const hp0 = player.hp;
        cast(engine, warden, GAOLERS_HOOK_ABILITY_ID, { x: player.x, y: player.y });
        stepSeconds(engine, 2);
        expect(player.hp).toBe(hp0 - GAOLERS_HOOK_DAMAGE);
        expect(dist(warden, player)).toBeLessThan(startDist / 2);
        expect(dist(warden, player)).toBeLessThan(HOOK_REEL_STANDOFF_PX + CELL_SIZE);
        engine.destroy();
    });

    it('is stopped by a wall between the Warden and its target', () => {
        const engine = setupEngine([[WARDEN_COL + 2, ROW]]);
        const warden = addWarden(engine);
        const player = addPlayer(engine, centre(WARDEN_COL + 5));
        const start = { x: player.x, y: player.y };
        const hp0 = player.hp;
        cast(engine, warden, GAOLERS_HOOK_ABILITY_ID, { x: player.x, y: player.y });
        stepSeconds(engine, 2);
        expect(player.hp).toBe(hp0);
        expect(Math.hypot(player.x - start.x, player.y - start.y)).toBeLessThan(1);
        engine.destroy();
    });

    it('misses an enemy that steps off the line during the wind-up', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        const player = addPlayer(engine, centre(WARDEN_COL + 5));
        const hp0 = player.hp;
        cast(engine, warden, GAOLERS_HOOK_ABILITY_ID, { x: player.x, y: player.y });
        player.y += CELL_SIZE * 2;
        stepSeconds(engine, 2);
        expect(player.hp).toBe(hp0);
        engine.destroy();
    });
});

describe('Execution Slam (1202)', () => {
    it('damages and knocks back an enemy in the disc, and spares one outside it', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        const inside = addPlayer(engine, warden.x + EXECUTION_SLAM_OFFSET_PX);
        const outside = addPlayer(engine, warden.x - CELL_SIZE * 3);
        const insideHp = inside.hp;
        const outsideHp = outside.hp;
        cast(engine, warden, EXECUTION_SLAM_ABILITY_ID, { x: warden.x + 100, y: warden.y });
        stepSeconds(engine, 0.5);
        expect(inside.hp).toBe(insideHp); // still winding up
        const xBefore = inside.x;
        stepSeconds(engine, 1.5);
        expect(inside.hp).toBe(insideHp - EXECUTION_SLAM_DAMAGE);
        expect(inside.x).toBeGreaterThan(xBefore);
        expect(outside.hp).toBe(outsideHp);
        engine.destroy();
    });

    it('keeps the Warden planted from wind-up through its recovery', () => {
        const zeroSpeed = [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        expect(ExecutionSlamAbility_1202.getAbilityStates(0.1)).toEqual(zeroSpeed);
        expect(ExecutionSlamAbility_1202.getAbilityStates(EXECUTION_SLAM_WINDUP_SEC + 1)).toEqual(zeroSpeed);
        expect(ExecutionSlamAbility_1202.getAbilityStates(EXECUTION_SLAM_WINDUP_SEC + 2)).toEqual([]);
    });
});

describe('Bulwark (1203)', () => {
    it('blocks attacks from the front but not from behind', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        addPlayer(engine, centre(GRID - 2));
        cast(engine, warden, BULWARK_ABILITY_ID, { x: warden.x + 100, y: warden.y });
        stepTicks(engine, 2);
        expect(canAttackBeBlocked(warden, warden.x + 60, warden.y, engine.gameTime)).toBe(true);
        expect(canAttackBeBlocked(warden, warden.x - 60, warden.y, engine.gameTime)).toBe(false);
        stepSeconds(engine, BULWARK_DURATION_SEC + 0.2);
        expect(canAttackBeBlocked(warden, warden.x + 60, warden.y, engine.gameTime)).toBe(false);
        engine.destroy();
    });
});

describe('Iron Warden AI', () => {
    it('slams up close, hooks at mid range and raises the shield beyond hook range', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        const close = addPlayer(engine, warden.x + EXECUTION_SLAM_REACH_PX - 20);
        const mid = addPlayer(engine, warden.x + 180);
        const far = addPlayer(engine, warden.x + GAOLERS_HOOK_RANGE_PX + 30);
        const ctx = aiContext(engine);
        expect(pickBestAbility(warden, [close], ctx)?.ability.id).toBe(EXECUTION_SLAM_ABILITY_ID);
        expect(pickBestAbility(warden, [mid], ctx)?.ability.id).toBe(GAOLERS_HOOK_ABILITY_ID);
        expect(pickBestAbility(warden, [far], ctx)?.ability.id).toBe(BULWARK_ABILITY_ID);
        engine.destroy();
    });
});

describe('Shieldbreak phase', () => {
    it('drops Bulwark once the Warden falls below the threshold', () => {
        const engine = setupEngine();
        const warden = addWarden(engine);
        addPlayer(engine, centre(GRID - 2));
        expect(warden.abilities).toContain(BULWARK_ABILITY_ID);
        const toDeal = Math.ceil(warden.maxHp * (1 - IRON_WARDEN_SHIELDBREAK_THRESHOLD)) + 1;
        warden.takeDamage(toDeal, null, engine.eventBus);
        stepTicks(engine, 2);
        expect(warden.abilities).not.toContain(BULWARK_ABILITY_ID);
        expect(warden.abilities).toContain(GAOLERS_HOOK_ABILITY_ID);
        expect(warden.abilities).toContain(EXECUTION_SLAM_ABILITY_ID);
        engine.destroy();
    });
});
