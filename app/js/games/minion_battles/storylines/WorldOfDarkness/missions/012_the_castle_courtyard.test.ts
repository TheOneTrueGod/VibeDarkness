import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES, TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../testing/runner/SimulationRunner';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { WorldOfDarknessStoryline } from '../WorldOfDarkness';
import { SWARM_NEST_CHARACTER_ID } from '../../../game/lanternite/swarmNestTick';
import { isTileInZone } from '../../../terrain/zones';
import { CASTLE_APPROACH_ZONE } from '../MapSegments/61_49_castle_gate';
import { CAMPSITE_3_MISSION_ID } from '../questMissions/campsite';
import { SWARMLING_STACK_SIZE, THE_LONELY_CASTLE_MISSION_ID, WOLF_STACK_SIZE } from './011_the_lonely_castle';
import {
    BRIDGE_CAMPFIRE_CELL,
    BRIDGE_PLAYER_SPAWN_POINTS,
    NORTHEAST_NEST_CELL,
    NORTHWEST_NEST_CELL,
    OBJECTIVE_DESTROY_SPAWNERS,
    THE_CASTLE_COURTYARD,
    THE_CASTLE_COURTYARD_MISSION_ID,
} from './012_the_castle_courtyard';

registerWorldOfDarknessSegments();

function initMission(seed = 7, players = 1): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: seed });
    const terrainManager = new TerrainManager(THE_CASTLE_COURTYARD.createTerrain());
    const composed = THE_CASTLE_COURTYARD.composeMap();
    const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
    THE_CASTLE_COURTYARD.initializeGameState(engine, {
        playerUnits: ids.map((playerId) => ({ playerId, name: playerId, portraitId: 'warrior' })),
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: Object.fromEntries(ids.map((id) => [id, ['004']])),
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    // The live session registers objectives alongside init (sessionEngineBinding).
    engine.registerBattleObjectives(THE_CASTLE_COURTYARD.battleObjectives ?? []);
    return engine;
}

function step(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

const cellOf = (u: { x: number; y: number }) => ({ col: Math.floor(u.x / CELL_SIZE), row: Math.floor(u.y / CELL_SIZE) });

describe('The Castle Courtyard (012)', () => {
    it('follows The Lonely Castle in Chapter 3', () => {
        const ch3 = WorldOfDarknessStoryline.chapters?.find((c) => c.id === 'wod_ch3');
        expect(ch3?.missionIds).toEqual([CAMPSITE_3_MISSION_ID, THE_LONELY_CASTLE_MISSION_ID, THE_CASTLE_COURTYARD_MISSION_ID]);
        expect(WorldOfDarknessStoryline.edges).toContainEqual(
            expect.objectContaining({ fromMissionId: THE_LONELY_CASTLE_MISSION_ID, toMissionId: THE_CASTLE_COURTYARD_MISSION_ID }),
        );
    });

    it('lays out courtyard over gate, with the campfire and spawns on the bridge and the nests on open ground', () => {
        const composed = THE_CASTLE_COURTYARD.composeMap()!;
        expect(composed.cols).toBe(22);
        expect(composed.rows).toBe(44);
        const terrain = THE_CASTLE_COURTYARD.createTerrain();
        expect(terrain.get(BRIDGE_CAMPFIRE_CELL.col, BRIDGE_CAMPFIRE_CELL.row)).toBe(TerrainType.Dirt);
        for (const sp of BRIDGE_PLAYER_SPAWN_POINTS) {
            expect(terrain.get(sp.col, sp.row), `spawn (${sp.col},${sp.row})`).toBe(TerrainType.Dirt);
        }
        for (const cell of [NORTHWEST_NEST_CELL, NORTHEAST_NEST_CELL]) {
            expect(TERRAIN_PROPERTIES[terrain.get(cell.col, cell.row)].passable).toBe(true);
        }
    });

    it('starts the party on the bridge beside a decaying campfire', () => {
        const engine = initMission(7, 4);
        const players = engine.units.filter((u) => u.isPlayerControlled());
        expect(players).toHaveLength(4);
        for (const p of players) {
            expect(BRIDGE_PLAYER_SPAWN_POINTS).toContainEqual(cellOf(p));
        }
        const fires = engine.specialTiles.filter((t) => t.defId === 'Campfire');
        expect(fires).toHaveLength(1);
        expect(fires[0]).toMatchObject({ col: BRIDGE_CAMPFIRE_CELL.col, row: BRIDGE_CAMPFIRE_CELL.row });
        expect(fires[0]!.emitsLight?.decayRate).toBeGreaterThan(0);
        engine.destroy();
    });

    it('has both spawners in the courtyard from the start; destroying them wins', () => {
        const engine = initMission();
        step(engine, 2);
        const nests = engine.units.filter((u) => u.characterId === SWARM_NEST_CHARACTER_ID && u.isAlive());
        expect(nests.map(cellOf)).toEqual(expect.arrayContaining([NORTHWEST_NEST_CELL, NORTHEAST_NEST_CELL]));
        expect(nests).toHaveLength(2);
        expect(engine.isObjectiveCompleted(OBJECTIVE_DESTROY_SPAWNERS)).toBe(false);
        expect(engine.state.levelEventManager.isTerminal).toBe(false);

        for (const nest of nests) nest.takeDamage(10_000, null, engine.eventBus);
        expect(nests.every((n) => !n.isAlive())).toBe(true);
        let guard = 0;
        while (!engine.state.levelEventManager.isTerminal && guard++ < 60) step(engine, 1);
        expect(engine.isObjectiveCompleted(OBJECTIVE_DESTROY_SPAWNERS)).toBe(true);
        expect(engine.state.levelEventManager.getTerminalOutcome()).toEqual({ kind: 'victory', missionResult: 'victory' });
        engine.destroy();
    });

    it('one Thornbinder and the darkness wave rise outside the castle south of the moat', () => {
        const engine = initMission();
        const zone = THE_CASTLE_COURTYARD.composeMap()!.zones.find((z) => z.id === CASTLE_APPROACH_ZONE.id)!;
        expect(zone).toBeDefined();
        const player = engine.units.find((u) => u.isPlayerControlled())!;

        step(engine, 2);
        const thornbinders = () => engine.units.filter((u) => u.characterId === 'thornbinder');
        expect(thornbinders()).toHaveLength(1);
        const rose = cellOf(thornbinders()[0]!);
        expect(isTileInZone(zone, rose.col, rose.row), `thornbinder at (${rose.col},${rose.row})`).toBe(true);

        // The lone hero would be overrun; keep them standing so the battle runs on.
        const stepAlive = () => {
            player.hp = player.maxHp;
            step(engine, 1);
        };
        const before = new Set(engine.units.map((u) => u.id));
        const startedAt = engine.gameTime;
        let guard = 0;
        while (engine.gameTime < startedAt + 12 && guard++ < 3000) stepAlive();
        expect(engine.gameTime).toBeGreaterThanOrEqual(startedAt + 12);
        const fresh = engine.units.filter(
            (u) => !before.has(u.id) && (u.characterId === 'dark_wolf' || u.characterId === 'slime'),
        );
        // Still only the one Thornbinder after more rounds: it spawns once, not every round.
        expect(thornbinders()).toHaveLength(1);
        expect(fresh.length).toBeGreaterThan(0);
        for (const u of fresh) {
            const { col, row } = cellOf(u);
            expect(isTileInZone(zone, col, row), `${u.characterId} at (${col},${row})`).toBe(true);
        }
        const freshWolves = fresh.filter((u) => u.characterId === 'dark_wolf');
        expect(freshWolves.length).toBeGreaterThan(0);
        for (const wolf of freshWolves) expect(wolf.stackSize).toBe(WOLF_STACK_SIZE);
        engine.destroy();
    });

    it('the spawners raise swarmlings in stacks', () => {
        const engine = initMission();
        const player = engine.units.find((u) => u.isPlayerControlled())!;
        let guard = 0;
        while (engine.gameTime < 8 && guard++ < 3000) {
            player.hp = player.maxHp;
            step(engine, 1);
        }
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling' && u.isAlive());
        expect(swarmlings.length).toBeGreaterThan(0);
        for (const s of swarmlings) expect(s.stackSize).toBe(SWARMLING_STACK_SIZE);
        engine.destroy();
    });
});
