import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { WorldOfDarknessStoryline } from '../WorldOfDarkness';
import { CAMPSITE_3_MISSION_ID } from '../questMissions/campsite';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { isTileInZone } from '../../../terrain/zones';
import { CASTLE_APPROACH_ZONE } from '../MapSegments/61_49_castle_gate';
import {
    BRIDGE_THRESHOLD,
    CAVE_ROAD_REGION,
    LEFT_CAVE_SPAWN_RADIUS_TILES,
    TRIGGER_LEFT_CAVE,
    NORTHEAST_NEST_CELL,
    NORTHWEST_NEST_CELL,
    OBJECTIVE_DESTROY_SPAWNERS,
    OBJECTIVE_REACH_BRIDGE,
    CAVE_EXIT_AMBUSH_SLIMES,
    CAVE_EXIT_AMBUSH_SWARMLINGS,
    CAVE_EXIT_AMBUSH_WOLVES,
    OPENING_THICKET_WOLVES,
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

const cellOf = (u: { x: number; y: number }) => ({ col: Math.floor(u.x / CELL_SIZE), row: Math.floor(u.y / CELL_SIZE) });
const centre = (c: { col: number; row: number }) => ({ x: (c.col + 0.5) * CELL_SIZE, y: (c.row + 0.5) * CELL_SIZE });

describe('The Lonely Castle (011)', () => {
    it('is the first mission of Chapter 3, reached from the last Chapter 2 campsite', () => {
        const ch3 = WorldOfDarknessStoryline.chapters?.find((c) => c.id === 'wod_ch3');
        expect(ch3?.missionIds).toEqual([THE_LONELY_CASTLE_MISSION_ID]);
        expect(ch3?.unlockAfterMissionId).toBe(CAMPSITE_3_MISSION_ID);
        expect(WorldOfDarknessStoryline.edges).toContainEqual(
            expect.objectContaining({ fromMissionId: CAMPSITE_3_MISSION_ID, toMissionId: THE_LONELY_CASTLE_MISSION_ID }),
        );
    });

    it('lays the route out cave → road → bend → gate → courtyard, with the bridge and nest cells on open ground', () => {
        const composed = THE_LONELY_CASTLE.composeMap()!;
        expect(composed.cols).toBe(66);
        expect(composed.rows).toBe(66);
        const terrain = THE_LONELY_CASTLE.createTerrain();
        expect(terrain.get(BRIDGE_THRESHOLD.col, BRIDGE_THRESHOLD.row)).toBe(TerrainType.Dirt);
        expect(terrain.get(BRIDGE_THRESHOLD.col + 1, BRIDGE_THRESHOLD.row)).toBe(TerrainType.Dirt);
        for (const cell of [NORTHWEST_NEST_CELL, NORTHEAST_NEST_CELL]) {
            expect(TERRAIN_PROPERTIES[terrain.get(cell.col, cell.row)].passable).toBe(true);
        }
    });

    it('starts with the outcrop thornbinder and the thicket wolves (no cave-exit ambush yet), all on walkable ground', () => {
        const engine = initMission();
        const enemies = engine.units.filter((u) => u.teamId === 'enemy');
        const count = (id: string) => enemies.filter((u) => u.characterId === id).length;
        expect(count('dark_wolf')).toBe(OPENING_THICKET_WOLVES);
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

    it('holds the darkness spawn while the party stays in the cave; leaving onto the road spawns the ambush around them', () => {
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
        const wolvesBefore = ofType('dark_wolf').length;

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
        // The cave-exit ambush plus the first road wave (2 wolves, 1 swarmling, 1 slime).
        expect(slimes()).toHaveLength(CAVE_EXIT_AMBUSH_SLIMES + 1);
        expect(ofType('swarmling')).toHaveLength(CAVE_EXIT_AMBUSH_SWARMLINGS + 1);
        expect(ofType('dark_wolf').length - wolvesBefore).toBe(CAVE_EXIT_AMBUSH_WOLVES + 2);
        for (const u of [...slimes(), ...ofType('swarmling')]) {
            const dist = Math.hypot(u.x - road!.x, u.y - road!.y) / CELL_SIZE;
            expect(dist).toBeLessThanOrEqual(LEFT_CAVE_SPAWN_RADIUS_TILES + 1);
        }
        engine.destroy();
    });

    it('reaching the bridge spawns the two spawners; destroying them wins', () => {
        const engine = initMission();
        step(engine, 2);
        expect(engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE)).toBe(false);
        expect(engine.units.filter((u) => u.characterId === SWARM_NEST_CHARACTER_ID)).toHaveLength(0);

        const player = engine.units.find((u) => u.isPlayerControlled())!;
        const bridge = centre(BRIDGE_THRESHOLD);
        player.x = bridge.x;
        player.y = bridge.y;
        player.clearMovement();
        let guard = 0;
        while (!engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE) && guard++ < 30) step(engine, 1);
        expect(engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE)).toBe(true);

        // The spawners appear the tick after, and the kill objective does not complete before they exist.
        step(engine, 2);
        const nests = engine.units.filter((u) => u.characterId === SWARM_NEST_CHARACTER_ID && u.isAlive());
        expect(nests.map(cellOf)).toEqual(expect.arrayContaining([NORTHWEST_NEST_CELL, NORTHEAST_NEST_CELL]));
        expect(nests).toHaveLength(2);
        expect(engine.isObjectiveCompleted(OBJECTIVE_DESTROY_SPAWNERS)).toBe(false);
        expect(engine.state.levelEventManager.isTerminal).toBe(false);

        // They rise out of the darkness first (untargetable while spawning).
        guard = 0;
        while (nests.some((n) => n.isSpawning()) && guard++ < 120) step(engine, 1);
        for (const nest of nests) nest.takeDamage(10_000, null, engine.eventBus);
        expect(nests.every((n) => !n.isAlive())).toBe(true);
        guard = 0;
        while (!engine.state.levelEventManager.isTerminal && guard++ < 60) step(engine, 1);
        expect(engine.isObjectiveCompleted(OBJECTIVE_DESTROY_SPAWNERS)).toBe(true);
        expect(engine.state.levelEventManager.getTerminalOutcome()).toEqual({ kind: 'victory', missionResult: 'victory' });
        engine.destroy();
    });

    it('after the bridge, one Thornbinder and the darkness wave rise outside the castle south of the moat', () => {
        const engine = initMission();
        const zone = THE_LONELY_CASTLE.composeMap()!.zones.find((z) => z.id === CASTLE_APPROACH_ZONE.id)!;
        expect(zone).toBeDefined();
        const openingIds = new Set(engine.units.map((u) => u.id));
        const player = engine.units.find((u) => u.isPlayerControlled())!;
        const bridge = centre(BRIDGE_THRESHOLD);
        player.x = bridge.x;
        player.y = bridge.y;
        player.clearMovement();
        let guard = 0;
        while (!engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE) && guard++ < 30) step(engine, 1);
        expect(engine.isObjectiveCompleted(OBJECTIVE_REACH_BRIDGE)).toBe(true);

        // One Thornbinder rises behind the party, south of the moat.
        step(engine, 2);
        const newThornbinders = () =>
            engine.units.filter((u) => u.characterId === 'thornbinder' && !openingIds.has(u.id));
        expect(newThornbinders()).toHaveLength(1);
        const rose = cellOf(newThornbinders()[0]!);
        expect(isTileInZone(zone, rose.col, rose.row), `thornbinder at (${rose.col},${rose.row})`).toBe(true);

        // The lone hero would be overrun; keep them standing so the battle runs on.
        const stepAlive = () => {
            player.hp = player.maxHp;
            step(engine, 1);
        };
        // Let the round 2-4 thicket wolves land first so only this wave counts.
        guard = 0;
        while (engine.gameTime < 31 && guard++ < 3000) stepAlive();
        const before = new Set(engine.units.map((u) => u.id));
        const reachedAt = engine.gameTime;
        guard = 0;
        while (engine.gameTime < reachedAt + 12 && guard++ < 3000) stepAlive();
        expect(engine.gameTime).toBeGreaterThanOrEqual(reachedAt + 12);
        const fresh = engine.units.filter(
            (u) => !before.has(u.id) && (u.characterId === 'dark_wolf' || u.characterId === 'slime'),
        );
        // Still only the one Thornbinder after more rounds: it spawns once, not every round.
        expect(newThornbinders()).toHaveLength(1);
        expect(fresh.length).toBeGreaterThan(0);
        for (const u of fresh) {
            const { col, row } = cellOf(u);
            expect(isTileInZone(zone, col, row), `${u.characterId} at (${col},${row})`).toBe(true);
        }
        engine.destroy();
    });
});
