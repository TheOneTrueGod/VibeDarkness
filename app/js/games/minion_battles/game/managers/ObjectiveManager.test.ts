/**
 * Battle objective evaluation and chaining.
 */
import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { ENEMY_BOAR } from '../../constants/enemyConstants';
import { createUnitFromSpawnConfig } from '../units';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { ObjectiveType } from '../../storylines/objectiveTypes';
import { getObjectiveTilesImage } from './ObjectiveManager';
import type { BattleObjectiveDef } from '../../storylines/types';

describe('ObjectiveManager', () => {
    it('hides chained objective until prerequisite completes, then completes when condition is met', () => {
        resetGameObjectIdCounter(1);
        const grid = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
        const tm = new TerrainManager(grid);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });

        const boar = createUnitFromSpawnConfig(
            {
                characterId: ENEMY_BOAR.characterId,
                name: ENEMY_BOAR.name,
                x: 100,
                y: 100,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ENEMY_BOAR.abilities,
                aiSettings: ENEMY_BOAR.aiSettings ?? null,
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(boar);

        engine.registerBattleObjectives([
            {
                id: 'kill_boar',
                objectiveType: ObjectiveType.KillTarget,
                label: 'Hunt the boar',
                toComplete: { type: 'unitDead', unitCharacterId: 'boar' },
            },
            {
                id: 'mop_up',
                objectiveType: ObjectiveType.EliminateAll,
                label: 'Clear remaining threats',
                requiresCompletedId: 'kill_boar',
                toComplete: { type: 'eliminateAllEnemies' },
            },
        ]);

        let rows = engine.getBattleObjectiveRows();
        expect(rows.map((r) => r.id)).toEqual(['kill_boar']);
        expect(rows[0]?.completed).toBe(false);

        boar.hp = 0;
        engine.state.objectiveManager.processObjectives();

        rows = engine.getBattleObjectiveRows();
        expect(rows.find((r) => r.id === 'kill_boar')?.completed).toBe(true);
        const mop = rows.find((r) => r.id === 'mop_up');
        expect(mop).toBeDefined();
        // Revealed this pass: first evaluated next pass, after level events can react to the reveal.
        expect(mop?.completed).toBe(false);

        engine.state.objectiveManager.processObjectives();
        rows = engine.getBattleObjectiveRows();
        expect(rows.find((r) => r.id === 'mop_up')?.completed).toBe(true);
    });

    it('atLeastRound gates eliminate objective until the round threshold', () => {
        resetGameObjectIdCounter(1);
        const grid = new TerrainGrid(20, 20, CELL_SIZE, TerrainType.Grass);
        const tm = new TerrainManager(grid);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: tm });

        const boar = createUnitFromSpawnConfig(
            {
                characterId: ENEMY_BOAR.characterId,
                name: ENEMY_BOAR.name,
                x: 200,
                y: 200,
                teamId: 'enemy',
                ownerId: 'ai',
                abilities: ENEMY_BOAR.abilities,
                aiSettings: ENEMY_BOAR.aiSettings ?? null,
            },
            engine.eventBus,
            engine,
        );
        engine.addUnit(boar);

        engine.registerBattleObjectives([
            {
                id: 'survive',
                objectiveType: ObjectiveType.Survive,
                label: 'Survive',
                toComplete: { type: 'atLeastRound', round: 3 },
            },
            {
                id: 'clear',
                objectiveType: ObjectiveType.EliminateAll,
                label: 'Clear',
                requiresCompletedId: 'survive',
                toComplete: { type: 'eliminateAllEnemies' },
            },
        ]);

        let rows = engine.getBattleObjectiveRows();
        expect(rows.map((r) => r.id)).toEqual(['survive']);
        engine.state.objectiveManager.processObjectives();
        rows = engine.getBattleObjectiveRows();
        expect(rows.find((r) => r.id === 'survive')?.completed).toBe(false);

        engine.roundNumber = 3;
        engine.state.objectiveManager.processObjectives();
        rows = engine.getBattleObjectiveRows();
        expect(rows.find((r) => r.id === 'survive')?.completed).toBe(true);
        expect(rows.find((r) => r.id === 'clear')).toBeDefined();
        expect(rows.find((r) => r.id === 'clear')?.completed).toBe(false);

        boar.hp = 0;
        engine.state.objectiveManager.processObjectives();
        expect(engine.getBattleObjectiveRows().find((r) => r.id === 'clear')?.completed).toBe(true);

        engine.destroy();
    });

    it('round-trips objective state in engine JSON', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.registerBattleObjectives([{ id: 'a', label: 'A', objectiveType: ObjectiveType.EliminateAll, toComplete: { type: 'eliminateAllEnemies' } }]);
        engine.state.objectiveManager.processObjectives();

        const json = engine.toJSON();
        expect(json.objectives?.completedIds).toContain('a');

        const restored = GameEngine.fromJSON(json, 'p1', null);
        restored.registerBattleObjectives([{ id: 'a', label: 'A', objectiveType: ObjectiveType.EliminateAll, toComplete: { type: 'eliminateAllEnemies' } }]);
        expect(restored.getBattleObjectiveRows().find((r) => r.id === 'a')?.completed).toBe(true);
        restored.destroy();
        engine.destroy();
    });
});

describe('objective tile markers by objectiveType', () => {
    const area = { type: 'allUnitsNearPosition' as const, col: 5, row: 5, maxDistance: 1 };
    const tiles = [{ col: 2, row: 2 }];

    it('uses footprints only for ReachLocation by default', () => {
        const def = (objectiveType: ObjectiveType): BattleObjectiveDef => ({
            id: 'x',
            label: 'X',
            objectiveType,
            toComplete: area,
        });
        expect(getObjectiveTilesImage(def(ObjectiveType.ReachLocation))).toBe('footprint');
        for (const t of Object.values(ObjectiveType)) {
            if (t === ObjectiveType.ReachLocation) continue;
            expect(getObjectiveTilesImage(def(t))).toBeNull();
        }
    });

    it('showObjectiveTiles: false disables hints and an explicit image overrides the type default', () => {
        const base: BattleObjectiveDef = { id: 'x', label: 'X', objectiveType: ObjectiveType.ReachLocation, toComplete: area };
        expect(getObjectiveTilesImage({ ...base, showObjectiveTiles: false })).toBeNull();
        expect(getObjectiveTilesImage({ ...base, showObjectiveTiles: { image: 'glowOrb' } })).toBe('glowOrb');
    });

    it('draws no tiles for a non-move objective even when it lists explicit tiles', () => {
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.registerBattleObjectives([
            { id: 'go', label: 'Go', objectiveType: ObjectiveType.ReachLocation, toComplete: area },
            {
                id: 'guard',
                label: 'Guard',
                objectiveType: ObjectiveType.Protect,
                toComplete: { type: 'atLeastRound', round: 9 },
                showObjectiveTiles: { tiles },
            },
        ]);
        const markers = engine.getObjectiveTileMarkers();
        expect(markers.map((m) => m.id)).toEqual(['go']);
        expect(markers[0]!.image).toBe('footprint');
        expect(markers[0]!.tiles).toHaveLength(9);
        engine.destroy();
    });
});
