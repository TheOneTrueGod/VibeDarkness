import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { WorldOfDarknessStoryline } from '../WorldOfDarkness';
import { CAMPSITE_3_MISSION_ID } from '../questMissions/campsite';
import {
    BRIDGE_THRESHOLD,
    CAVE_ROAD_REGION,
    LEFT_CAVE_SPAWN_AREA,
    LEFT_CAVE_SPAWN_RADIUS_TILES,
    TRIGGER_LEFT_CAVE,
    OBJECTIVE_REACH_BRIDGE,
    CAVE_EXIT_AMBUSH_SLIMES,
    CAVE_EXIT_AMBUSH_SWARMLINGS,
    CAVE_EXIT_AMBUSH_WOLVES,
    OPENING_THICKET_WOLVES,
    ROAD_WAVE_SLIMES,
    ROAD_WAVE_SWARMLINGS,
    ROAD_WAVE_WOLVES,
    SWARMLING_STACK_SIZE,
    WOLF_STACK_SIZE,
    THE_LONELY_CASTLE,
    THE_LONELY_CASTLE_MISSION_ID,
} from './011_the_lonely_castle';

registerWorldOfDarknessSegments();

function initMission(seed = 7): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrainManager = new TerrainManager(THE_LONELY_CASTLE.createTerrain());
    const composed = THE_LONELY_CASTLE.composeMap();
    THE_LONELY_CASTLE.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    // The live session registers objectives alongside init (sessionEngineBinding).
    engine.registerBattleObjectives(THE_LONELY_CASTLE.battleObjectives ?? []);
    return engine;
}

function step(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

const centre = (c: { col: number; row: number }) => ({ x: (c.col + 0.5) * CELL_SIZE, y: (c.row + 0.5) * CELL_SIZE });

describe('The Lonely Castle (011)', () => {
    it('opens Chapter 3, reached from the last Chapter 2 campsite', () => {
        const ch3 = WorldOfDarknessStoryline.chapters?.find((c) => c.id === 'wod_ch3');
        expect(ch3?.missionIds?.[0]).toBe(THE_LONELY_CASTLE_MISSION_ID);
        expect(ch3?.unlockAfterMissionId).toBe(CAMPSITE_3_MISSION_ID);
        expect(WorldOfDarknessStoryline.edges).toContainEqual(
            expect.objectContaining({ fromMissionId: CAMPSITE_3_MISSION_ID, toMissionId: THE_LONELY_CASTLE_MISSION_ID }),
        );
    });

    it('lays the route out cave → road → bend → gate, with the bridge on open ground', () => {
        const composed = THE_LONELY_CASTLE.composeMap()!;
        expect(composed.cols).toBe(66);
        expect(composed.rows).toBe(44);
        const terrain = THE_LONELY_CASTLE.createTerrain();
        expect(terrain.get(BRIDGE_THRESHOLD.col, BRIDGE_THRESHOLD.row)).toBe(TerrainType.Dirt);
        expect(terrain.get(BRIDGE_THRESHOLD.col + 1, BRIDGE_THRESHOLD.row)).toBe(TerrainType.Dirt);
    });

    it('starts with the outcrop thornbinder and the thicket wolves (no cave-exit ambush yet), all on walkable ground', () => {
        const engine = initMission();
        const enemies = engine.units.filter((u) => u.teamId === 'enemy');
        const count = (id: string) => enemies.filter((u) => u.characterId === id).length;
        expect(count('dark_wolf')).toBe(OPENING_THICKET_WOLVES);
        for (const wolf of enemies.filter((u) => u.characterId === 'dark_wolf')) {
            expect(wolf.stackSize).toBe(WOLF_STACK_SIZE);
        }
        expect(count('swarmling')).toBe(0);
        expect(count('slime')).toBe(0);
        expect(count('thornbinder')).toBe(1);
        for (const u of enemies) {
            expect(engine.terrainManager!.isPassable(u.x, u.y)).toBe(true);
        }
        engine.destroy();
    });

    it('lights the home cave from its crystal and campfire light spots', () => {
        const engine = initMission();
        const tiles = engine.specialTiles;
        expect(tiles.filter((t) => t.defId === 'Crystal').length).toBeGreaterThan(0);
        expect(tiles.filter((t) => t.defId === 'Campfire')).toHaveLength(1);
        engine.destroy();
    });

    it('holds the darkness spawn while the party stays in the cave; leaving onto the road scatters the ambush across the hillside east of the cave', () => {
        const engine = initMission();
        const ofType = (id: string) => engine.units.filter((u) => u.characterId === id && u.isAlive());
        const slimes = () => ofType('slime');
        let guard = 0;
        // Past where the old round-2 darkness spawn began (gameTime 10s).
        while (engine.gameTime < 15 && guard++ < 3000) step(engine, 1);
        expect(engine.gameTime).toBeGreaterThanOrEqual(15);
        expect(engine.state.levelEventManager.triggerManager.hasFired(TRIGGER_LEFT_CAVE)).toBe(false);
        expect(slimes()).toHaveLength(0);
        expect(ofType('swarmling')).toHaveLength(0);
        const wolvesBefore = ofType('dark_wolf').map((u) => u.id);

        // Step the hero onto the cave road.
        const player = engine.units.find((u) => u.isPlayerControlled())!;
        const col = CAVE_ROAD_REGION.col + Math.floor(CAVE_ROAD_REGION.width / 2);
        let road: { x: number; y: number } | null = null;
        for (let row = CAVE_ROAD_REGION.row; row < CAVE_ROAD_REGION.row + CAVE_ROAD_REGION.height && !road; row++) {
            const p = centre({ col, row });
            if (engine.terrainManager!.isPassable(p.x, p.y)) road = p;
        }
        player.x = road!.x;
        player.y = road!.y;
        player.clearMovement();
        step(engine, 2);

        expect(engine.state.levelEventManager.triggerManager.hasFired(TRIGGER_LEFT_CAVE)).toBe(true);
        // The cave-exit ambush plus the first road wave: wolves and the ambush swarmlings come as stacks.
        expect(slimes()).toHaveLength(CAVE_EXIT_AMBUSH_SLIMES + ROAD_WAVE_SLIMES);
        const swarmlings = ofType('swarmling');
        expect(swarmlings).toHaveLength(CAVE_EXIT_AMBUSH_SWARMLINGS + ROAD_WAVE_SWARMLINGS);
        const swarmlingCreatures = swarmlings.reduce((n, u) => n + u.stackSize, 0);
        expect(swarmlingCreatures).toBe(CAVE_EXIT_AMBUSH_SWARMLINGS * SWARMLING_STACK_SIZE + ROAD_WAVE_SWARMLINGS);
        const newWolves = ofType('dark_wolf').filter((u) => !wolvesBefore.includes(u.id));
        expect(newWolves).toHaveLength(CAVE_EXIT_AMBUSH_WOLVES + ROAD_WAVE_WOLVES);
        for (const wolf of newWolves) expect(wolf.stackSize).toBe(WOLF_STACK_SIZE);
        // Scattered across the hillside between the cave mouth and ~20 tiles east, not bunched up.
        const caveMouthX = CAVE_ROAD_REGION.col * CELL_SIZE;
        const exitWave = [...slimes(), ...ofType('swarmling')];
        for (const u of exitWave) {
            const dist = Math.hypot(u.x - LEFT_CAVE_SPAWN_AREA.x, u.y - LEFT_CAVE_SPAWN_AREA.y) / CELL_SIZE;
            expect(dist).toBeLessThanOrEqual(LEFT_CAVE_SPAWN_RADIUS_TILES + 1);
            expect(u.x).toBeGreaterThanOrEqual(caveMouthX);
            expect(u.x).toBeLessThanOrEqual(caveMouthX + 21 * CELL_SIZE);
        }
        const xs = exitWave.map((u) => u.x / CELL_SIZE);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(4);
        engine.destroy();
    });

    it('reaching the bridge wins the mission', () => {
        const engine = initMission();
        step(engine, 2);
        expect(engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE)).toBe(false);
        expect(engine.state.levelEventManager.isTerminal).toBe(false);

        const player = engine.units.find((u) => u.isPlayerControlled())!;
        const bridge = centre(BRIDGE_THRESHOLD);
        player.x = bridge.x;
        player.y = bridge.y;
        player.clearMovement();
        let guard = 0;
        while (!engine.state.levelEventManager.isTerminal && guard++ < 60) step(engine, 1);
        expect(engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE)).toBe(true);
        expect(engine.state.levelEventManager.getTerminalOutcome()).toEqual({ kind: 'victory', missionResult: 'victory' });
        engine.destroy();
    });
});
