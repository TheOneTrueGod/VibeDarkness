import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    DISPLACER,
    ARENA_LIGHT_AMOUNT,
    ARENA_LIGHT_RADIUS,
    DISPLACER_MISSION_ID,
    DISPLACER_PLAYER_SPAWN_ANCHOR,
    DISPLACER_PLAYER_SPAWN_POINTS,
    OPENING_WOLF_COUNT,
    ROUND_WOLF_COUNT,
} from './006d_displacer';
import {
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
    it('has 8 distinct, passable player spawn tiles around the anchor (2 right, 2 down of the road entrance)', () => {
        expect(DISPLACER_PLAYER_SPAWN_ANCHOR).toEqual({ col: 3, row: 11 });
        expect(DISPLACER_PLAYER_SPAWN_POINTS[0]).toEqual(DISPLACER_PLAYER_SPAWN_ANCHOR);
        expect(DISPLACER_PLAYER_SPAWN_POINTS).toHaveLength(8);
        expect(new Set(DISPLACER_PLAYER_SPAWN_POINTS.map((p) => `${p.col},${p.row}`)).size).toBe(8);
        const terrain = DISPLACER.createTerrain();
        for (const p of DISPLACER_PLAYER_SPAWN_POINTS) {
            expect(terrain.isPassable((p.col + 0.5) * CELL_SIZE, (p.row + 0.5) * CELL_SIZE)).toBe(true);
            // Every spawn stays near the anchor and well left of the circle.
            expect(Math.abs(p.col - DISPLACER_PLAYER_SPAWN_ANCHOR.col)).toBeLessThanOrEqual(2);
            expect(Math.abs(p.row - DISPLACER_PLAYER_SPAWN_ANCHOR.row)).toBeLessThanOrEqual(1);
        }
    });

    it('ring lights emit exactly the configured strength (maxHp matches hp, so no light inflation)', () => {
        const engine = initMission();
        const tiles = engine.specialTiles.filter((t) => t.defId === 'DarkCrystal');
        expect(tiles).toHaveLength(ARENA_RING_SPAWN_POINTS.length);
        for (const t of tiles) {
            expect(t.hp).toBe(t.maxHp);
            expect(t.emitsLight!.lightAmount).toBe(ARENA_LIGHT_AMOUNT);
            expect(t.emitsLight!.radius).toBe(ARENA_LIGHT_RADIUS);
        }
        const sources = engine.state.specialTileManager.buildLightSourcesFromSpecialTiles();
        expect(sources).toHaveLength(tiles.length);
        for (const s of sources) expect(s.emission).toBe(ARENA_LIGHT_AMOUNT);
        engine.destroy();
    });

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
        expect(DISPLACER_PLAYER_SPAWN_POINTS.some((p) => p.col === col && p.row === row)).toBe(true);
        expect(col).toBeLessThan(BOSS_ARENA_SIZE / 2);

        const bosses = engine.units.filter((u) => u.characterId === 'displacer_spirit');
        expect(bosses).toHaveLength(1);
        // Boss kit: own AI tree, starts with 2 super bars.
        expect(bosses[0]!.unitAITreeId).toBe('displacerBoss');
        expect(bosses[0]!.getResource('super')?.current).toBe(2);
        expect(bosses[0]!.abilities).toEqual(['0017', '0018', '0019', '0020']);
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
