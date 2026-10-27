import { describe, it, expect } from 'vitest';
import { GameEngine } from '../GameEngine';
import { resetGameObjectIdCounter } from '../GameObject';
import { TerrainGrid, CELL_SIZE } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainType } from '../../terrain/TerrainType';
import { ObjectiveType } from '../../storylines/objectiveTypes';
import type { LevelEvent, SpawnWaveEntry } from '../../storylines/types';

/** A test objective that completes once round 3 is reached. */
const GATE = 'gate';

function setupEngine(events: LevelEvent[]): GameEngine {
    resetGameObjectIdCounter(1);
    const grid = new TerrainGrid(10, 10, CELL_SIZE, TerrainType.Grass);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 1, terrainManager: new TerrainManager(grid) });
    engine.registerBattleObjectives([
        { id: GATE, label: 'Gate', objectiveType: ObjectiveType.Survive, toComplete: { type: 'atLeastRound', round: 3 } },
    ]);
    engine.registerLevelEvents(events);
    return engine;
}

const wolf: SpawnWaveEntry = {
    characterId: 'dark_wolf',
    name: 'Wolf',
    spawnBehaviour: 'anywhere',
    spawnCount: 1,
    unitAITreeId: 'hunt',
};

function wolves(engine: GameEngine): number {
    return engine.units.filter((u) => u.characterId === 'dark_wolf').length;
}

/** Advance to the start of `round` and run level events, then objectives (engine order). */
function atRound(engine: GameEngine, round: number): void {
    engine.roundNumber = round;
    engine.gameTime = (round - 1) * 10;
    engine.state.levelEventManager.processLevelEvents();
    engine.state.objectiveManager.processObjectives();
}

describe('LevelEventManager objective gates', () => {
    it('afterObjective: a spawn wave waits for the objective, then fires once', () => {
        const engine = setupEngine([
            { type: 'spawnWave', trigger: { atRound: 1 }, afterObjective: GATE, spawns: [wolf] },
        ]);
        atRound(engine, 1);
        atRound(engine, 2);
        expect(wolves(engine)).toBe(0);
        atRound(engine, 3); // objective completes after this pass's level events
        expect(engine.isObjectiveCompleted(GATE)).toBe(true);
        expect(wolves(engine)).toBe(0);
        atRound(engine, 4);
        atRound(engine, 5);
        expect(wolves(engine)).toBe(1);
    });

    it('untilObjective: a continuous spawn stops once the objective completes', () => {
        const engine = setupEngine([
            { type: 'continuousSpawn', trigger: { intervalRounds: 1, startRound: 1 }, untilObjective: GATE, spawns: [wolf] },
        ]);
        atRound(engine, 1);
        atRound(engine, 2);
        atRound(engine, 3);
        const beforeGate = wolves(engine);
        expect(beforeGate).toBe(3);
        atRound(engine, 4);
        atRound(engine, 5);
        expect(wolves(engine)).toBe(beforeGate);
    });

    it('afterObjective: a continuous spawn starts one interval after the gate opens', () => {
        const engine = setupEngine([
            { type: 'continuousSpawn', trigger: { intervalRounds: 1 }, afterObjective: GATE, spawns: [wolf] },
        ]);
        atRound(engine, 3); // gate opens
        atRound(engine, 4); // gate seen: interval starts now
        expect(wolves(engine)).toBe(0);
        atRound(engine, 5);
        expect(wolves(engine)).toBe(1);
    });

    it('objectiveCompleted victory condition', () => {
        const engine = setupEngine([
            { type: 'victoryCheck', trigger: { afterRound: 1 }, conditions: [{ type: 'objectiveCompleted', objectiveId: GATE }] },
        ]);
        atRound(engine, 2);
        engine.state.levelEventManager.runVictoryChecks();
        expect(engine.state.levelEventManager.isTerminal).toBe(false);
        atRound(engine, 3);
        engine.state.levelEventManager.runVictoryChecks();
        expect(engine.state.levelEventManager.getTerminalOutcome()?.kind).toBe('victory');
    });
});
