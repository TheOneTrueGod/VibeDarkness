import { describe, it, expect } from 'vitest';
import { composeMissionMap } from './missionLayout';
import { getMissionSegmentPlacements } from './segmentRegistry';
import { TerrainType } from './TerrainType';
import { registerWorldOfDarknessSegments } from '../storylines/WorldOfDarkness/registerSegments';
import {
    BOSS_ARENA_SEGMENT_ID,
    BOSS_ARENA_SIZE,
    BOSS_ARENA_CENTER,
    BOSS_ARENA_DIRT_RADIUS,
} from '../storylines/WorldOfDarkness/MapSegments/0_0_boss_arena';
import {
    CRYSTAL_CAVE_SEGMENT_ID,
    CAVE_CAMPFIRE,
    HOME_PLAYER_SPAWN_OFFSETS,
} from '../storylines/WorldOfDarkness/MapSegments/50_50_crystal_cave';

registerWorldOfDarknessSegments();

const LAYOUT = [
    [{ kind: 'segment' as const, id: BOSS_ARENA_SEGMENT_ID }, { kind: 'spawn' as const }],
];

describe('composeMissionMap', () => {
    it('places the spawn tile by layout, not world-grid address', () => {
        const composed = composeMissionMap(LAYOUT, CRYSTAL_CAVE_SEGMENT_ID);
        expect(composed.cols).toBe(BOSS_ARENA_SIZE * 2);
        expect(composed.rows).toBe(BOSS_ARENA_SIZE);

        const arena = composed.placements.find((p) => p.id === BOSS_ARENA_SEGMENT_ID);
        const home = composed.placements.find((p) => p.id === CRYSTAL_CAVE_SEGMENT_ID);
        expect(arena).toEqual({
            id: BOSS_ARENA_SEGMENT_ID,
            originCol: 0,
            originRow: 0,
            width: BOSS_ARENA_SIZE,
            height: BOSS_ARENA_SIZE,
        });
        expect(home).toEqual({
            id: CRYSTAL_CAVE_SEGMENT_ID,
            originCol: BOSS_ARENA_SIZE,
            originRow: 0,
            width: BOSS_ARENA_SIZE,
            height: BOSS_ARENA_SIZE,
        });

        const worldGrid = getMissionSegmentPlacements([BOSS_ARENA_SEGMENT_ID, CRYSTAL_CAVE_SEGMENT_ID]);
        const worldHome = worldGrid.find((p) => p.id === CRYSTAL_CAVE_SEGMENT_ID);
        expect(worldHome?.originCol).toBeGreaterThan(BOSS_ARENA_SIZE);
    });

    it('shifts home player spawns and campfire onto the east tile', () => {
        const composed = composeMissionMap(LAYOUT, CRYSTAL_CAVE_SEGMENT_ID);
        expect(composed.playerSpawnPoints).toHaveLength(HOME_PLAYER_SPAWN_OFFSETS.length);
        expect(composed.playerSpawnPoints).toContainEqual({
            col: CAVE_CAMPFIRE.col + BOSS_ARENA_SIZE + HOME_PLAYER_SPAWN_OFFSETS[0].dCol,
            row: CAVE_CAMPFIRE.row + HOME_PLAYER_SPAWN_OFFSETS[0].dRow,
        });
        const campfire = composed.pois.find((p) => p.type === 'campfire');
        expect(campfire).toMatchObject({
            col: CAVE_CAMPFIRE.col + BOSS_ARENA_SIZE,
            row: CAVE_CAMPFIRE.row,
        });
    });

    it('keeps a dirt circle in the west tile and a walkable seam into the cave', () => {
        const composed = composeMissionMap(LAYOUT, CRYSTAL_CAVE_SEGMENT_ID);
        const grid = composed.terrainGrid;
        expect(grid.get(BOSS_ARENA_CENTER.col, BOSS_ARENA_CENTER.row)).toBe(TerrainType.Dirt);
        expect(grid.get(0, 0)).toBe(TerrainType.Grass);

        const eastOfCircle = BOSS_ARENA_CENTER.col + BOSS_ARENA_DIRT_RADIUS + 1;
        expect(grid.get(eastOfCircle, BOSS_ARENA_CENTER.row)).toBe(TerrainType.Grass);

        const seamArenaCol = BOSS_ARENA_SIZE - 1;
        const seamHomeCol = BOSS_ARENA_SIZE;
        const caveMouthRow = CAVE_CAMPFIRE.row;
        expect(grid.get(seamArenaCol, caveMouthRow)).not.toBe(TerrainType.Rock);
        expect(grid.get(seamHomeCol, caveMouthRow)).not.toBe(TerrainType.Rock);
    });
});
