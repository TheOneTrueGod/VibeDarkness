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
import {
    BRIDGE_THRESHOLD,
    NORTHEAST_NEST_CELL,
    NORTHWEST_NEST_CELL,
    OBJECTIVE_DESTROY_SPAWNERS,
    OBJECTIVE_REACH_BRIDGE,
    OPENING_APRON_SLIMES,
    OPENING_APRON_SWARMLINGS,
    OPENING_APRON_WOLVES,
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

    it('starts with the apron group, the outcrop thornbinder and the thicket wolves, all on walkable ground', () => {
        const engine = initMission();
        const enemies = engine.units.filter((u) => u.teamId === 'enemy');
        const count = (id: string) => enemies.filter((u) => u.characterId === id).length;
        expect(count('dark_wolf')).toBe(OPENING_APRON_WOLVES + OPENING_THICKET_WOLVES);
        expect(count('swarmling')).toBe(OPENING_APRON_SWARMLINGS);
        expect(count('slime')).toBe(OPENING_APRON_SLIMES);
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
});
