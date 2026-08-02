import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainType, TERRAIN_PROPERTIES } from '../../../terrain/TerrainType';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { isTileInZone, resolveZoneTiles } from '../../../terrain/zones';
import {
    ENEMY_SPAWN_ZONE,
    OPENING_SLIME_COUNT,
    OPENING_WOLF_COUNT,
    SWARM_PRESSURE,
} from './002_swarm_pressure';

function passableSpawnZoneTileCount(terrain: ReturnType<typeof SWARM_PRESSURE.createTerrain>): number {
    return resolveZoneTiles(ENEMY_SPAWN_ZONE).filter(
        (t) => TERRAIN_PROPERTIES[terrain.get(t.col, t.row)].passable,
    ).length;
}

describe('SwarmPressureMission', () => {
    it('narrows the C choke to a two-row opening at cols 10–11, rows 9–10', () => {
        const terrain = SWARM_PRESSURE.createTerrain();
        // Opening: both wall columns stay grass for rows 9–10.
        expect(terrain.get(10, 9)).toBe(TerrainType.Grass);
        expect(terrain.get(11, 9)).toBe(TerrainType.Grass);
        expect(terrain.get(10, 10)).toBe(TerrainType.Grass);
        expect(terrain.get(11, 10)).toBe(TerrainType.Grass);
        // Walls close immediately above and below the opening.
        expect(terrain.get(10, 8)).toBe(TerrainType.Rock);
        expect(terrain.get(11, 8)).toBe(TerrainType.Rock);
        expect(terrain.get(10, 11)).toBe(TerrainType.Rock);
        expect(terrain.get(11, 11)).toBe(TerrainType.Rock);
    });

    it('pre-places wolves, slimes, and fills remaining ENEMY_SPAWN_ZONE tiles with swarmlings', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = SWARM_PRESSURE.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const passableTiles = passableSpawnZoneTileCount(terrain);

        SWARM_PRESSURE.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
        });

        const wolves = engine.units.filter((u) => u.characterId === 'dark_wolf');
        const slimes = engine.units.filter((u) => u.characterId === 'slime');
        const swarmlings = engine.units.filter((u) => u.characterId === 'swarmling');
        const packCount = wolves.length + slimes.length;

        expect(wolves).toHaveLength(OPENING_WOLF_COUNT);
        expect(slimes).toHaveLength(OPENING_SLIME_COUNT);
        expect(swarmlings).toHaveLength(passableTiles - packCount);

        const cellSize = terrain.cellSize;
        const occupied = new Set<string>();
        for (const unit of [...wolves, ...slimes, ...swarmlings]) {
            expect(unit.spawnTimer).toBe(0);
            const col = Math.floor(unit.x / cellSize);
            const row = Math.floor(unit.y / cellSize);
            expect(isTileInZone(ENEMY_SPAWN_ZONE, col, row)).toBe(true);
            occupied.add(`${col},${row}`);
        }
        // One unit per passable zone tile (no stacking / gaps among the opening pack).
        expect(occupied.size).toBe(passableTiles);

        engine.destroy();
    });
});
