/**
 * enemyScalingPlayerCount: frozen at mission start from the human player roster;
 * used for enemy HP scaling (not pets/summons on the player team).
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';
import { resetGameObjectIdCounter } from './GameObject';
import { DARK_AWAKENING } from '../storylines/WorldOfDarkness/missions/001_dark_awakening';
import { TerrainGrid, CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainManager } from '../terrain/TerrainManager';
import { TerrainType } from '../terrain/TerrainType';
import { getDefaultHp, PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import {
    COMMAND_CORE_TREE_ID,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
} from '../../../researchTrees/trees/command_core';
import {
    ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT,
    getEnemyHealthMultiplier,
} from '../constants/enemyConstants';
import { isSinglePlayerBattle } from '../abilities/singlePlayerBattle';
import { Unit } from './units/Unit';

const DARK_WOLF_BASE_HP = getDefaultHp('dark_wolf');

function setupTerrain(): TerrainManager {
    const grid = new TerrainGrid(12, 12, CELL_SIZE, TerrainType.Grass);
    return new TerrainManager(grid);
}

describe('enemyScalingPlayerCount', () => {
    it('sets roster size from playerUnits and ignores a Command Core pet', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({
            localPlayerId: 'p1',
            randomSeed: 1,
            terrainManager: setupTerrain(),
        });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            playerResearchTreesByPlayer: {
                p1: { [COMMAND_CORE_TREE_ID]: [COMMAND_CORE_NODE_LOYAL_COMPANION] },
            },
        });

        expect(engine.enemyScalingPlayerCount).toBe(1);
        expect(isSinglePlayerBattle(engine)).toBe(true);

        const heroes = engine.units.filter(
            (u) => u.characterId === PLAYER_CHARACTER_ID && u.isPlayerControlled(),
        );
        const pets = engine.units.filter((u) => u.teamId === 'player' && !u.isPlayerControlled());
        expect(heroes).toHaveLength(1);
        expect(pets.length).toBeGreaterThanOrEqual(1);
        // Live team count would be heroes+pets; frozen roster must stay at 1.
        expect(engine.units.filter((u) => u.teamId === 'player').length).toBeGreaterThan(1);
        engine.destroy();
    });

    it('sets roster size to 2 for two player characters', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'], p2: ['004'] },
        });
        expect(engine.enemyScalingPlayerCount).toBe(2);
        expect(isSinglePlayerBattle(engine)).toBe(false);
        expect(getEnemyHealthMultiplier(engine.enemyScalingPlayerCount)).toBe(
            ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT[2],
        );
        engine.destroy();
    });

    it('wave spawns use frozen count, not live player-team unit count', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({
            localPlayerId: 'p1',
            randomSeed: 1,
            terrainManager: setupTerrain(),
        });
        engine.enemyScalingPlayerCount = 1;

        // Extra player-team units that must not inflate enemy HP.
        for (let i = 0; i < 3; i++) {
            engine.addUnit(
                new Unit({
                    id: `pet_${i}`,
                    x: 40,
                    y: 40 + i * 10,
                    hp: 20,
                    maxHp: 20,
                    speed: 100,
                    teamId: 'player',
                    ownerId: 'ai',
                    characterId: 'dog',
                    name: 'Dog',
                }),
                'initialGameSpawn',
            );
        }
        expect(engine.units.filter((u) => u.teamId === 'player').length).toBe(3);

        engine.registerLevelEvents([
            {
                type: 'spawnWave',
                trigger: { atRound: 1 },
                spawns: [
                    {
                        characterId: 'dark_wolf',
                        name: 'Wolf',
                        spawnBehaviour: 'anywhere',
                        spawnCount: 1,
                        unitAITreeId: 'hunt',
                    },
                ],
            },
        ]);
        engine.state.levelEventManager.processLevelEvents();

        const wolf = engine.units.find((u) => u.characterId === 'dark_wolf');
        expect(wolf).toBeDefined();
        expect(wolf!.maxHp).toBe(DARK_WOLF_BASE_HP);
        engine.destroy();
    });

    it('wave spawns apply 2x HP when enemyScalingPlayerCount is 2', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({
            localPlayerId: 'p1',
            randomSeed: 1,
            terrainManager: setupTerrain(),
        });
        engine.enemyScalingPlayerCount = 2;

        engine.registerLevelEvents([
            {
                type: 'spawnWave',
                trigger: { atRound: 1 },
                spawns: [
                    {
                        characterId: 'dark_wolf',
                        name: 'Wolf',
                        spawnBehaviour: 'anywhere',
                        spawnCount: 1,
                        unitAITreeId: 'hunt',
                    },
                ],
            },
        ]);
        engine.state.levelEventManager.processLevelEvents();

        const wolf = engine.units.find((u) => u.characterId === 'dark_wolf');
        expect(wolf).toBeDefined();
        expect(wolf!.maxHp).toBe(
            Math.round(DARK_WOLF_BASE_HP * ENEMY_HEALTH_MULTIPLIER_BY_PLAYER_COUNT[2]!),
        );
        engine.destroy();
    });

    it('serializes and restores enemyScalingPlayerCount', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'], p2: ['004'] },
        });
        expect(engine.enemyScalingPlayerCount).toBe(2);

        const json = engine.toJSON();
        expect(json.enemyScalingPlayerCount).toBe(2);

        const restored = GameEngine.fromJSON(json, 'p1', null);
        expect(restored.enemyScalingPlayerCount).toBe(2);
        engine.destroy();
        restored.destroy();
    });

    it('legacy checkpoints without the field recover from player characters present', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        DARK_AWAKENING.initializeGameState(engine, {
            playerUnits: [
                { playerId: 'p1', name: 'P1', portraitId: 'warrior' },
                { playerId: 'p2', name: 'P2', portraitId: 'ranger' },
            ],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'], p2: ['004'] },
        });
        const json = engine.toJSON();
        delete json.enemyScalingPlayerCount;

        const restored = GameEngine.fromJSON(json, 'p1', null);
        expect(restored.enemyScalingPlayerCount).toBe(2);
        engine.destroy();
        restored.destroy();
    });
});
