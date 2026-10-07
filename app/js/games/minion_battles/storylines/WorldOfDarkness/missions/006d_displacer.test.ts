import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    DISPLACER,
    DISPLACER_MISSION_ID,
    OPENING_WOLF_COUNT,
    ROUND_WOLF_COUNT,
} from './006d_displacer';
import {
    ARENA_OUTSIDE_ROAD_SPAWN_POINTS,
    ARENA_RING_SPAWN_POINTS,
    BOSS_ARENA_SIZE,
} from '../MapSegments/0_0_boss_arena';

registerWorldOfDarknessSegments();

function initMission(): GameEngine {
    resetGameObjectIdCounter(1);
    const engine = new GameEngine();
    engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
    const terrain = DISPLACER.createTerrain();
    DISPLACER.initializeGameState(engine, {
        playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
        localPlayerId: 'p1',
        eventBus: engine.eventBus,
        equippedItemsByPlayer: { p1: ['004'] },
        terrainManager: new TerrainManager(terrain),
    });
    return engine;
}

describe('DisplacerMission', () => {
    it('uses the circle arena terrain', () => {
        expect(DISPLACER.missionId).toBe(DISPLACER_MISSION_ID);
        const terrain = DISPLACER.createTerrain();
        expect(terrain.width).toBe(BOSS_ARENA_SIZE);
        expect(terrain.height).toBe(BOSS_ARENA_SIZE);
    });

    it('spawns the party on the left, the boss, two wolves, and lights on the ring', () => {
        const engine = initMission();
        const player = engine.units.find((u) => u.teamId === 'player')!;
        const col = Math.floor(player.x / CELL_SIZE);
        const row = Math.floor(player.y / CELL_SIZE);
        expect(ARENA_OUTSIDE_ROAD_SPAWN_POINTS.some((p) => p.col === col && p.row === row)).toBe(true);
        expect(col).toBeLessThan(BOSS_ARENA_SIZE / 2);

        expect(engine.units.filter((u) => u.characterId === 'displacer_spirit')).toHaveLength(1);
        expect(engine.units.filter((u) => u.characterId === 'dark_wolf')).toHaveLength(OPENING_WOLF_COUNT);

        for (const pt of ARENA_RING_SPAWN_POINTS) {
            const tile = engine.specialTiles.find((t) => t.col === pt.col && t.row === pt.row);
            expect(tile?.emitsLight).toBeDefined();
        }
        engine.destroy();
    });

    it('spawns two wolves every round', () => {
        const spawn = DISPLACER.levelEvents!.find((e) => e.type === 'continuousSpawn');
        expect(spawn).toBeDefined();
        if (spawn?.type !== 'continuousSpawn') return;
        expect(spawn.trigger.intervalRounds).toBe(1);
        expect(spawn.spawns[0]).toMatchObject({ characterId: 'dark_wolf', spawnCount: ROUND_WOLF_COUNT });
    });
});
