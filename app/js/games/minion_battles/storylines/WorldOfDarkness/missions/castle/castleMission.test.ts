import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../../game/GameObject';
import { TerrainManager } from '../../../../terrain/TerrainManager';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import { resolveParallelOrderPause } from '../../../../testing/runner/SimulationRunner';
import { ObjectiveType } from '../../../objectiveTypes';
import type { LevelEvent } from '../../../types';
import { registerWorldOfDarknessSegments } from '../../registerSegments';
import { castleMapPosition } from '../../chapter3Map';
import { SEGMENT_61_47_CROSSROADS } from '../../MapSegments/castle/61_47_crossroads';
import { COURTYARD_ENTRY_SOUTH } from '../../MapSegments/61_48_castle_courtyard';
import {
    CASTLE_EXIT_OBJECTIVE_ID,
    CASTLE_REACH_RADIUS_TILES,
    castlePoi,
    castleRoomLayout,
    defineCastleMission,
    parseSegmentAddress,
    type CastleMission,
} from './castleMission';
import { CASTLE_SPAWN_PRESETS, CASTLE_STANDARD_THORNBINDER_INTERVAL_ROUNDS } from './castleSpawnPresets';
import { courtMagicianBossSetup, PLACEHOLDER_BOSS_OBJECTIVE_ID } from './castleBosses';

registerWorldOfDarknessSegments();

const CROSSROADS = '61_47_crossroads';
const COURTYARD = '61_48_castle_courtyard';
/** Courtyard south entry (its POI id carries the room address). */
const ENTRY = { id: '61_48_entry_south', ...COURTYARD_ENTRY_SOUTH };
const EXIT = castlePoi(SEGMENT_61_47_CROSSROADS, '61_47_exit_north');
const CROSSING = castlePoi(SEGMENT_61_47_CROSSROADS, '61_47_crossing');

/** A valid base config for the error and override cases. */
const WALK_CONFIG_FOR_ERRORS = {
    id: 'test_castle_other',
    name: 'Other',
    description: 'Other.',
    rooms: [COURTYARD, CROSSROADS],
    entry: ENTRY,
    exit: EXIT,
    spawnPreset: 'castle_standard' as const,
};

/** Courtyard (61_48) up to the crossroads' great hall door (61_47). */
const WALK = defineCastleMission({
    id: 'test_castle_walk',
    name: 'Test Walk',
    description: 'Two-room test mission.',
    rooms: [COURTYARD, CROSSROADS],
    entry: ENTRY,
    exit: EXIT,
    exitLabel: 'Reach the great hall',
    spawnPreset: 'castle_standard',
});

/** The same two rooms, with a placeholder boss at the crossing and no exit. */
const BOSS_FIGHT = defineCastleMission({
    id: 'test_castle_boss',
    name: 'Test Boss',
    description: 'Two-room test boss.',
    rooms: [COURTYARD, CROSSROADS],
    entry: ENTRY,
    spawnPreset: 'castle_boss',
    boss: { kind: 'placeholder', poi: CROSSING },
});

function initMission(mission: CastleMission, players = 1): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 7 });
    const terrainManager = new TerrainManager(mission.createTerrain());
    const composed = mission.composeMap();
    const playerUnits = Array.from({ length: players }, (_, i) => ({ playerId: `p${i + 1}`, name: `P${i + 1}`, portraitId: 'warrior' }));
    mission.initializeGameState(engine, {
        playerUnits,
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: Object.fromEntries(playerUnits.map((p) => [p.playerId, ['004']])),
        terrainManager,
        terrainSegmentPOIs: composed?.pois,
        terrainSegmentZones: composed?.zones,
    });
    engine.registerBattleObjectives(mission.battleObjectives ?? []);
    return engine;
}

function step(engine: GameEngine, ticks: number): void {
    for (let i = 0; i < ticks; i++) {
        resolveParallelOrderPause(engine);
        engine.stepSimulationFixedTicks(1);
    }
}

const chebyshev = (a: { col: number; row: number }, b: { col: number; row: number }) =>
    Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
const cellOf = (u: { x: number; y: number }) => ({ col: Math.floor(u.x / CELL_SIZE), row: Math.floor(u.y / CELL_SIZE) });

describe('defineCastleMission', () => {
    it('lays the rooms out by grid address, north-west first, with gaps left empty', () => {
        expect(parseSegmentAddress(CROSSROADS)).toEqual({ col: 61, row: 47 });
        expect(parseSegmentAddress('61_44_throne')).toEqual({ col: 61, row: 44 });
        expect(parseSegmentAddress('courtyard_northwest')).toBeNull();

        expect(WALK.mapLayout).toEqual([
            [{ kind: 'segment', id: CROSSROADS }],
            [{ kind: 'segment', id: COURTYARD }],
        ]);
        expect(WALK.segmentIds).toEqual([COURTYARD, CROSSROADS]);
        expect(WALK.worldWidth).toBe(22 * CELL_SIZE);
        expect(WALK.worldHeight).toBe(44 * CELL_SIZE);
        const composed = WALK.composeMap()!;
        expect(composed.cols).toBe(22);
        expect(composed.rows).toBe(44);

        const diagonal = castleRoomLayout([CROSSROADS, '62_48_herb_garden']);
        expect(diagonal.layout).toEqual([
            [{ kind: 'segment', id: CROSSROADS }, null],
            [null, { kind: 'segment', id: '62_48_herb_garden' }],
        ]);
        expect(() => castleRoomLayout(['great_hall'])).toThrow(/does not start/);
        expect(() =>
            defineCastleMission({ ...WALK_CONFIG_FOR_ERRORS, entry: { id: '59_44_boss', col: 1, row: 1 } }),
        ).toThrow(/not one of the rooms/);
    });

    it('sits on the centre of its rooms on the Mission Map; a boss makes it a boss node', () => {
        expect(WALK.mapPosition).toEqual(castleMapPosition(61, 47.5));
        expect(WALK.missionType).toBe('battle');
        expect(BOSS_FIGHT.missionType).toBe('boss');
        const pinned = defineCastleMission({ ...WALK_CONFIG_FOR_ERRORS, mapNode: { col: 61, row: 47 } });
        expect(pinned.mapPosition).toEqual(castleMapPosition(61, 47));
    });

    it('asks the party to reach the exit, and the preset waves run until it is reached', () => {
        expect(WALK.exitCell).toEqual({ col: EXIT.col, row: EXIT.row }); // 61_47 is the top slot
        expect(WALK.entryCell).toEqual({ col: COURTYARD_ENTRY_SOUTH.col, row: 22 + COURTYARD_ENTRY_SOUTH.row });
        expect(WALK.battleObjectives).toEqual([
            {
                id: CASTLE_EXIT_OBJECTIVE_ID,
                objectiveType: ObjectiveType.ReachLocation,
                label: 'Reach the great hall',
                toComplete: { type: 'allUnitsNearPosition', col: EXIT.col, row: EXIT.row, maxDistance: CASTLE_REACH_RADIUS_TILES },
            },
        ]);
        const spawns = WALK.levelEvents.filter((e): e is Extract<LevelEvent, { type: 'continuousSpawn' }> => e.type === 'continuousSpawn');
        expect(spawns.map((e) => e.trigger.intervalRounds)).toEqual([1, CASTLE_STANDARD_THORNBINDER_INTERVAL_ROUNDS]);
        for (const e of spawns) expect(e.untilObjective).toBe(CASTLE_EXIT_OBJECTIVE_ID);
        expect(spawns[0]!.spawns.map((s) => s.characterId)).toEqual(['dark_wolf', 'swarmling', 'slime']);
        expect(spawns[1]!.spawns.map((s) => s.characterId)).toEqual(['thornbinder']);
        expect(WALK.levelEvents).toContainEqual({
            type: 'victoryCheck',
            trigger: { afterRound: 0 },
            conditions: [{ type: 'objectiveCompleted', objectiveId: CASTLE_EXIT_OBJECTIVE_ID }],
        });
        expect(WALK.lightLevelEnabled).toBe(true);
        expect(WALK.globalLightLevel).toBe(0);
    });

    it('spawns the party on open cells beside the entry, and the opening enemies at enemySpawn POIs away from it', () => {
        const engine = initMission(WALK, 4);
        expect(WALK.playerSpawnPoints).toHaveLength(8);
        for (const p of WALK.playerSpawnPoints!) {
            expect(engine.terrainManager!.isPassable((p.col + 0.5) * CELL_SIZE, (p.row + 0.5) * CELL_SIZE)).toBe(true);
            expect(chebyshev(p, WALK.entryCell)).toBeLessThanOrEqual(2);
        }
        const heroes = engine.units.filter((u) => u.isPlayerControlled());
        expect(heroes).toHaveLength(4);
        for (const h of heroes) expect(chebyshev(cellOf(h), WALK.entryCell)).toBeLessThanOrEqual(2);

        const enemies = engine.units.filter((u) => u.teamId === 'enemy');
        const preset = CASTLE_SPAWN_PRESETS.castle_standard;
        expect(enemies.length).toBeGreaterThan(0);
        expect(enemies.length).toBeLessThanOrEqual(preset.openingMax);
        const composedSpawns = WALK.composeMap()!.pois.filter((p) => p.type === 'enemySpawn');
        for (const u of enemies) {
            expect(engine.terrainManager!.isPassable(u.x, u.y)).toBe(true);
            expect(chebyshev(cellOf(u), WALK.entryCell)).toBeGreaterThanOrEqual(preset.openingMinDistanceFromEntryTiles);
            expect(composedSpawns.some((p) => p.col === cellOf(u).col && p.row === cellOf(u).row)).toBe(true);
        }
        expect(enemies.map((u) => u.characterId)).toEqual(['dark_wolf', 'slime']);
        expect(enemies[0]!.stackSize).toBe(2);
        engine.destroy();
    });

    it('raises darkness waves while the party is on its way, and reaching the exit wins', () => {
        const engine = initMission(WALK);
        const enemyCount = () => engine.units.filter((u) => u.teamId === 'enemy').length;
        const opening = enemyCount();
        let guard = 0;
        while (engine.gameTime < 25 && guard++ < 3000) step(engine, 1);
        expect(enemyCount()).toBeGreaterThan(opening);
        expect(engine.state.levelEventManager.isTerminal).toBe(false);

        const hero = engine.units.find((u) => u.isPlayerControlled())!;
        hero.x = (EXIT.col + 0.5) * CELL_SIZE;
        hero.y = (EXIT.row + 0.5) * CELL_SIZE;
        hero.clearMovement();
        guard = 0;
        while (!engine.state.levelEventManager.isTerminal && guard++ < 120) step(engine, 1);
        expect(engine.isObjectiveCompleted(CASTLE_EXIT_OBJECTIVE_ID)).toBe(true);
        expect(engine.state.levelEventManager.getTerminalOutcome()).toEqual({ kind: 'victory', missionResult: 'victory' });
        engine.destroy();
    });

    it('a placeholder boss puts an Alpha Wolf on its POI with a defeat objective and no waves', () => {
        expect(BOSS_FIGHT.bossCell).toEqual({ col: CROSSING.col, row: CROSSING.row });
        expect(BOSS_FIGHT.battleObjectives).toEqual([
            expect.objectContaining({
                id: PLACEHOLDER_BOSS_OBJECTIVE_ID,
                objectiveType: ObjectiveType.KillTarget,
                toComplete: { type: 'unitDead', unitCharacterId: 'alpha_wolf' },
            }),
        ]);
        expect(BOSS_FIGHT.levelEvents.some((e) => e.type === 'continuousSpawn')).toBe(false);
        expect(BOSS_FIGHT.levelEvents).toContainEqual(
            expect.objectContaining({
                type: 'victoryCheck',
                conditions: [{ type: 'objectiveCompleted', objectiveId: PLACEHOLDER_BOSS_OBJECTIVE_ID }],
            }),
        );

        const engine = initMission(BOSS_FIGHT);
        const wolves = engine.units.filter((u) => u.characterId === 'alpha_wolf');
        expect(wolves).toHaveLength(1);
        expect(cellOf(wolves[0]!)).toEqual(BOSS_FIGHT.bossCell);
        // The castle_boss opening: one wolf stack as the escort.
        expect(engine.units.filter((u) => u.characterId === 'dark_wolf')).toHaveLength(CASTLE_SPAWN_PRESETS.castle_boss.openingMax);
        engine.destroy();
    });

    it('a custom boss runs its setup on the boss cell, moving anything off blocked ground', () => {
        const mission = defineCastleMission({
            ...WALK_CONFIG_FOR_ERRORS,
            id: 'test_castle_magician',
            exit: undefined,
            spawnPreset: 'castle_boss',
            boss: { kind: 'custom', poi: CROSSING, setup: (centre) => courtMagicianBossSetup(centre, 'Defeat him') },
        });
        expect(mission.battleObjectives.map((o) => o.id)).toEqual(['defeat_court_magician']);
        const engine = initMission(mission);
        const mage = engine.units.find((u) => u.characterId === 'court_magician')!;
        expect(cellOf(mage)).toEqual(mission.bossCell);
        const crystals = engine.units.filter((u) => u.characterId === 'court_crystal');
        expect(crystals.length).toBeGreaterThan(0);
        for (const c of crystals) expect(engine.terrainManager!.isPassable(c.x, c.y)).toBe(true);
        engine.destroy();
    });
});

describe('castle wall crystals', () => {
    const wallCrystals = (engine: GameEngine) => engine.specialTiles.filter((t) => t.defId === 'WallCrystal');

    it('spreads dormant wall crystals along the walls, the same every battle', () => {
        const engine = initMission(WALK);
        const crystals = wallCrystals(engine);
        expect(crystals.length).toBeGreaterThan(5);
        for (const c of crystals) {
            expect(c.dormant).toBe(true);
            expect(engine.terrainManager!.grid.isPassable(c.col * CELL_SIZE + 1, c.row * CELL_SIZE + 1)).toBe(false);
        }
        const again = initMission(WALK);
        expect(wallCrystals(again).map((c) => c.id)).toEqual(crystals.map((c) => c.id));
        engine.destroy();
        again.destroy();
    });

    it('wallCrystals: false places none', () => {
        const engine = initMission(defineCastleMission({ ...WALK_CONFIG_FOR_ERRORS, wallCrystals: false }));
        expect(wallCrystals(engine)).toEqual([]);
        engine.destroy();
    });

    it('a hero standing beside a wall crystal wakes it within a few seconds', () => {
        const engine = initMission(WALK);
        const hero = engine.units.find((u) => u.isPlayerControlled())!;
        const grid = engine.terrainManager!.grid;
        const centre = (col: number, row: number) => ({ x: col * CELL_SIZE + CELL_SIZE / 2, y: row * CELL_SIZE + CELL_SIZE / 2 });
        const besideFloor = (c: { col: number; row: number }) =>
            [[1, 0], [-1, 0], [0, 1], [0, -1]]
                .map(([dc, dr]) => centre(c.col + dc!, c.row + dr!))
                .find((p) => grid.isPassable(p.x, p.y));
        const near = wallCrystals(engine).find((c) => besideFloor(c))!;
        const spot = besideFloor(near)!;
        hero.x = spot.x;
        hero.y = spot.y;
        expect(near.dormant).toBe(true);
        for (let i = 0; i < 400 && near.dormant; i++) step(engine, 1);
        expect(near.dormant).toBe(false);
        expect(engine.gameTime).toBeGreaterThan(1.95);
        engine.destroy();
    });
});
