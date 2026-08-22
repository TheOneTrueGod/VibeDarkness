import { describe, it, expect } from 'vitest';
import { GameEngine } from '../../../game/GameEngine';
import { resetGameObjectIdCounter } from '../../../game/GameObject';
import { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { THE_CIRCLE } from './010_circle_arena';
import {
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    BOSS_ARENA_CENTER,
} from '../MapSegments/0_0_boss_arena';
import {
    CRYSTAL_CAVE_SEGMENT_ID,
    CAVE_CAMPFIRE,
    HOME_PLAYER_SPAWN_OFFSETS,
} from '../MapSegments/50_50_crystal_cave';
import { HOME_CAMPFIRE_MAX_HP } from '../../homeBase';

registerWorldOfDarknessSegments();

describe('CircleArenaMission', () => {
    it('stitches the arena west of the cave home', () => {
        const composed = THE_CIRCLE.composeMap();
        expect(composed).not.toBeNull();
        expect(composed!.cols).toBe(BOSS_ARENA_SIZE * 2);
        expect(composed!.spawnPlacement?.id).toBe(CRYSTAL_CAVE_SEGMENT_ID);
        expect(composed!.spawnPlacement?.originCol).toBe(BOSS_ARENA_SIZE);

        const terrain = THE_CIRCLE.createTerrain();
        expect(terrain.width).toBe(BOSS_ARENA_SIZE * 2);
        expect(terrain.height).toBe(BOSS_ARENA_SIZE);
        expect(terrain.get(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row)).toBe(TerrainType.Dirt);
        expect(terrain.get(0, 0)).toBe(TerrainType.Grass);

        const manager = new TerrainManager(terrain);
        manager.segmentPlacements = composed!.placements;
        expect(manager.getSegmentIdAt(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row)).toBe(BOSS_ARENA_SEGMENT_ID);
        expect(manager.getSegmentIdAt(BOSS_ARENA_SIZE + 1, CAVE_CAMPFIRE.row)).toBe(CRYSTAL_CAVE_SEGMENT_ID);
    });

    it('spawns players in the cave and places the home campfire', () => {
        resetGameObjectIdCounter(1);
        const engine = new GameEngine();
        engine.prepareForNewGame({ localPlayerId: 'p1', randomSeed: 42 });
        const terrain = THE_CIRCLE.createTerrain();
        const terrainManager = new TerrainManager(terrain);
        const composed = THE_CIRCLE.composeMap();

        THE_CIRCLE.initializeGameState(engine, {
            playerUnits: [{ playerId: 'p1', name: 'P1', portraitId: 'warrior' }],
            localPlayerId: 'p1',
            eventBus: engine.eventBus,
            equippedItemsByPlayer: { p1: ['004'] },
            terrainManager,
            terrainSegmentPOIs: composed?.pois,
            terrainSegmentZones: composed?.zones,
        });

        const hero = engine.units.find((u) => u.ownerId === 'p1');
        expect(hero).toBeDefined();
        const heroCol = Math.floor(hero!.x / CELL_SIZE);
        const heroRow = Math.floor(hero!.y / CELL_SIZE);
        const expectedSpawns = HOME_PLAYER_SPAWN_OFFSETS.map((offset) => ({
            col: CAVE_CAMPFIRE.col + BOSS_ARENA_SIZE + offset.dCol,
            row: CAVE_CAMPFIRE.row + offset.dRow,
        }));
        expect(expectedSpawns).toContainEqual({ col: heroCol, row: heroRow });

        const campfire = engine.specialTiles.find((t) => t.defId === 'Campfire');
        expect(campfire).toMatchObject({
            col: CAVE_CAMPFIRE.col + BOSS_ARENA_SIZE,
            row: CAVE_CAMPFIRE.row,
            maxHp: HOME_CAMPFIRE_MAX_HP,
        });

        engine.destroy();
    });
});
