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
                label: 'Hunt the boar',
                toComplete: { type: 'unitDead', unitCharacterId: 'boar' },
            },
            {
                id: 'mop_up',
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
        expect(mop?.completed).toBe(true);
    });

    it('round-trips objective state in engine JSON', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1 });
        engine.registerBattleObjectives([
            { id: 'a', label: 'A', toComplete: { type: 'eliminateAllEnemies' } },
        ]);
        engine.state.objectiveManager.processObjectives();

        const json = engine.toJSON();
        expect(json.objectives?.completedIds).toContain('a');

        const restored = GameEngine.fromJSON(json, 'p1', null);
        restored.registerBattleObjectives([
            { id: 'a', label: 'A', toComplete: { type: 'eliminateAllEnemies' } },
        ]);
        expect(restored.getBattleObjectiveRows().find((r) => r.id === 'a')?.completed).toBe(true);
        restored.destroy();
        engine.destroy();
    });
});
