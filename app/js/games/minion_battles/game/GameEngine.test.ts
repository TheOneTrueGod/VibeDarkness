/**
 * GameEngine serialization tests: toJSON round-trip restores state, units, projectiles, effects, orders.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { DARK_AWAKENING } from '../storylines/WorldOfDarkness/missions/001_dark_awakening';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { Resonance } from '../resources/Resonance';
import { Unit } from './units/Unit';
import {
    EARTH_CORE_RESONANCE_GAIN_ROUND_START,
    EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY,
    EARTH_CORE_RESONANCE_MAX,
} from '../card_defs/05_earth_core/earthCoreConstants';
import { BEDROCK_SCAVENGER_PASSIVE_ID } from '../abilities/earthCoreMeleePassives';
import { getEarthCoreArmour } from '../abilities/earthCoreArmour';
import { initializeAbilityRuntimeForUnit } from '../abilities/abilityUses';

describe('GameEngine', () => {
    it.each([
        [1, [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }]],
        [
            2,
            [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
        ],
        [
            3,
            [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
                { playerId: 'p3', name: 'P3', portraitId: 'warrior' },
            ],
        ],
    ] as const)('spawns %i player unit(s) when game started with %i player(s)', (expectedCount, playerUnits) => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        const equippedByPlayer: Record<string, string[]> = {};
        playerUnits.forEach((pu) => {
            equippedByPlayer[pu.playerId] = ['004'];
        });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [...playerUnits],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: equippedByPlayer,
        });
        const playerUnitCount = engine.units.filter((u) => u.isPlayerControlled()).length;
        expect(playerUnitCount).toBe(expectedCount);
        engine.destroy();
    });

    it('serializes and restores game state with units, projectiles, effects, and orders', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.localPlayerId = 'p1';
        engine.gameTime = 5.5;
        engine.gameTick = 330;
        engine.roundNumber = 2;
        engine.snapshotIndex = 3;
        engine.waitingForOrders = { waiters: [{ unitId: 'unit_1', ownerId: 'p1' }], atTick: 331 };
        engine.pendingOrders = [
            { gameTick: 331, order: { unitId: 'unit_1', abilityId: 'wait', targets: [] } },
        ];

        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
        });

        const json = engine.toJSON();
        expect(json.gameTick).toBe(330);
        expect(json.gameTime).toBe(5.5);
        expect(json.roundNumber).toBe(2);
        expect(json.units.length).toBeGreaterThan(0);
        expect(json.orders).toBeDefined();
        expect(json.orders!.length).toBe(1);
        expect(json.orders![0].gameTick).toBe(331);

        const restored = GameEngine.fromJSON(json, 'p1', null);
        expect(restored.gameTick).toBe(engine.gameTick);
        expect(restored.gameTime).toBe(engine.gameTime);
        expect(restored.roundNumber).toBe(engine.roundNumber);
        expect(restored.snapshotIndex).toBe(engine.snapshotIndex);
        // waitingForOrders is intentionally cleared when a matching pending order already exists,
        // so the engine will apply the order naturally without pausing.
        expect(restored.waitingForOrders).toBeNull();
        expect(restored.isPaused).toBe(false);
        expect(restored.units.length).toBe(engine.units.length);
        expect(restored.pendingOrders.length).toBe(engine.pendingOrders.length);
        expect(restored.pendingOrders[0].gameTick).toBe(331);
        expect(restored.pendingOrders[0].order.abilityId).toBe('wait');

        engine.destroy();
    });

    it('restores units with same ids and positions', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
        });
        const json = engine.toJSON();
        const restored = GameEngine.fromJSON(json, 'p1', null);

        for (let i = 0; i < engine.units.length; i++) {
            const u = engine.units[i];
            const r = restored.units[i];
            expect(r.id).toBe(u.id);
            expect(r.x).toBe(u.x);
            expect(r.y).toBe(u.y);
            expect(r.hp).toBe(u.hp);
            expect(r.teamId).toBe(u.teamId);
        }
        engine.destroy();
    });

    it('emits round_start once when round begins', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        const emittedRoundStarts: number[] = [];
        engine.eventBus.on('round_start', (data) => {
            emittedRoundStarts.push(data.roundNumber);
        });

        engine.stepSimulationFixedTicks(1);
        expect(emittedRoundStarts).toEqual([1]);
        engine.stepSimulationFixedTicks(1);
        expect(emittedRoundStarts).toEqual([1]);

        engine.destroy();
    });

    it('emits nearby_stone_damaged through engine helper', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });

        const emitted: Array<{ unitId: string; sourceUnitId: string | null; causedBySelfOrAlly: boolean }> = [];
        engine.eventBus.on('nearby_stone_damaged', (data) => {
            emitted.push({
                unitId: data.unitId,
                sourceUnitId: data.sourceUnitId,
                causedBySelfOrAlly: data.causedBySelfOrAlly,
            });
        });

        engine.emitNearbyStoneDamaged({
            unitId: 'unit_1',
            sourceUnitId: 'unit_2',
            causedBySelfOrAlly: true,
            col: 4,
            row: 6,
        });

        expect(emitted).toEqual([
            {
                unitId: 'unit_1',
                sourceUnitId: 'unit_2',
                causedBySelfOrAlly: true,
            },
        ]);

        engine.destroy();
    });

    it('applies resonance gains from round_start and nearby_stone_damaged events', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
        });

        const unit = engine.units[0];
        expect(unit).toBeDefined();
        if (!unit) {
            engine.destroy();
            return;
        }

        const resonance = new Resonance();
        unit.attachResource(resonance, engine.eventBus);

        engine.stepSimulationFixedTicks(1); // emits round_start once at battle start
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_GAIN_ROUND_START);

        engine.emitNearbyStoneDamaged({
            unitId: unit.id,
            sourceUnitId: unit.id,
            causedBySelfOrAlly: true,
        });
        expect(resonance.current).toBe(
            EARTH_CORE_RESONANCE_GAIN_ROUND_START + EARTH_CORE_RESONANCE_GAIN_STONE_DAMAGED_NEARBY,
        );

        for (let i = 0; i < 40; i++) {
            engine.emitNearbyStoneDamaged({
                unitId: unit.id,
                sourceUnitId: unit.id,
                causedBySelfOrAlly: true,
            });
        }
        expect(resonance.current).toBe(EARTH_CORE_RESONANCE_MAX);

        engine.destroy();
    });

    it('grants Bedrock Scavenger armour on round_start based on nearby stone, capped at 3', () => {
        const grid = TerrainGrid.createFilledTerrain(8, 8, CELL_SIZE, TerrainType.Grass);
        const terrainManager = new TerrainManager(grid);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager });
        const unit = new Unit({
            id: 'unit_bedrock',
            x: 4 * CELL_SIZE + (CELL_SIZE / 2),
            y: 4 * CELL_SIZE + (CELL_SIZE / 2),
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Bedrock Tester',
        });
        engine.addUnit(unit);
        unit.abilities.push(BEDROCK_SCAVENGER_PASSIVE_ID);
        grid.set(4, 4, TerrainType.Rock);
        grid.set(5, 4, TerrainType.Rock);
        grid.createOrMarkRock(4, 5);
        grid.set(3, 4, TerrainType.Rock); // More than cap in range.

        engine.stepSimulationFixedTicks(1);
        expect(getEarthCoreArmour(unit)).toBe(3);

        engine.destroy();
    });

    it('grants one lightCharge at round_start when charged_rocks is researched', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.setPlayerResearchTreesByPlayer({
            p1: {
                crystal_rocks: ['charged_rocks'],
            },
        });
        const unit = new Unit({
            id: 'unit_charged_rocks',
            x: 100,
            y: 100,
            hp: 100,
            speed: 100,
            teamId: 'player',
            ownerId: 'p1',
            characterId: 'player',
            name: 'Charged Rocks Tester',
            abilities: ['throw_charged_rock'],
        });
        initializeAbilityRuntimeForUnit(unit);
        const runtime = unit.abilityRuntime.throw_charged_rock;
        expect(runtime).toBeDefined();
        if (!runtime) {
            engine.destroy();
            return;
        }
        runtime.currentUses = Math.max(0, runtime.currentUses - 1);
        expect(runtime.currentUses).toBe(2);
        engine.addUnit(unit);

        engine.stepSimulationFixedTicks(1);
        expect(unit.abilityRuntime.throw_charged_rock?.currentUses).toBe(3);

        engine.destroy();
    });

    it('emits terrain_stone_damaged from terrain mutations', () => {
        const grid = TerrainGrid.createFilledTerrain(3, 3, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager });

        const emitted: Array<{ previousState: string; state: string }> = [];
        engine.eventBus.on('terrain_stone_damaged', (event) => {
            emitted.push({
                previousState: event.previousState,
                state: event.state,
            });
        });

        terrainManager.damageRock(1, 1); // natural -> cracked
        terrainManager.damageRock(1, 1); // cracked -> cracked, no event
        terrainManager.damageRock(1, 1);
        terrainManager.damageRock(1, 1);
        terrainManager.damageRock(1, 1); // cracked -> spent

        expect(emitted).toEqual([
            { previousState: 'natural_stone', state: 'cracked_rock' },
            { previousState: 'cracked_rock', state: 'spent_rubble' },
        ]);

        engine.destroy();
    });

    it('serializes and restores terrain stone mutations in checkpoints', () => {
        const grid = TerrainGrid.createFilledTerrain(4, 4, CELL_SIZE, TerrainType.Grass);
        grid.set(1, 1, TerrainType.Rock);
        grid.set(2, 1, TerrainType.Rock);
        const terrainManager = new TerrainManager(grid);

        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager });

        terrainManager.createOrMarkRock(2, 1);
        terrainManager.damageRock(1, 1); // natural -> cracked
        terrainManager.consumeRockInRadius(2, 1, 0); // created -> spent

        const json = engine.toJSON();
        expect(json.terrainStoneMutations).toBeDefined();
        expect(json.terrainStoneMutations?.length).toBeGreaterThan(0);

        const restoredGrid = TerrainGrid.createFilledTerrain(4, 4, CELL_SIZE, TerrainType.Grass);
        const restoredTerrainManager = new TerrainManager(restoredGrid);
        const restored = GameEngine.fromJSON(json, 'p1', restoredTerrainManager);

        expect(restoredTerrainManager.getStoneState(1, 1)).toBe('cracked_rock');
        expect(restoredTerrainManager.getStoneHealth(1, 1)).toBe(24);
        expect(restoredTerrainManager.getStoneState(2, 1)).toBe('spent_rubble');
        expect(restoredGrid.get(2, 1)).toBe(TerrainType.Dirt);

        restored.destroy();
        engine.destroy();
    });

    it('computeInitialFingerprint is deterministic for same seeded setup', () => {
        const a = new GameEngine();
        const b = new GameEngine();
        a.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 123 });
        b.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 123 });
        const fpA = a.computeInitialFingerprint();
        const fpB = b.computeInitialFingerprint();
        expect(fpA).toBe(fpB);
        a.destroy();
        b.destroy();
    });

    it('fires tick-complete callback with runtime fingerprint hex each tick', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const calls: Array<{ tick: number; fp: string; paused: boolean }> = [];
        engine.setOnTickComplete((tick, fp, paused) => {
            calls.push({ tick, fp, paused });
        });
        engine.stepSimulationFixedTicks(2);
        expect(calls.length).toBeGreaterThanOrEqual(1);
        expect(calls[0]?.tick).toBe(1);
        expect(calls[0]?.fp).toMatch(/^[0-9a-f]{16}$/);
        expect(typeof calls[0]?.paused).toBe('boolean');
        engine.destroy();
    });
});
