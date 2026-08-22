/**
 * 0_0 Boss arena — encounter tile (not a World of Darkness overworld address).
 * Layout-composer missions place this by layout cell, so it can sit next to 50_50.
 * Grass field with a large dirt circle and a few interior rocks.
 */

import { TerrainType } from '../../../terrain/TerrainType';

export const BOSS_ARENA_SEGMENT_ID = '0_0_boss_arena';
export const BOSS_ARENA_GRID_COL = 0;
export const BOSS_ARENA_GRID_ROW = 0;
export const BOSS_ARENA_SIZE = 22;
export const BOSS_ARENA_CENTER = { col: 11, row: 11 } as const;
export const BOSS_ARENA_DIRT_RADIUS = 7;

/** Interior cover; kept off the eastern approach so the 50_50 cave mouth stays clear. */
export const BOSS_ARENA_ROCKS = [
    { col: 8, row: 7 },
    { col: 9, row: 7 },
    { col: 8, row: 8 },
    { col: 13, row: 14 },
    { col: 14, row: 14 },
    { col: 6, row: 13 },
] as const;

function isInDirtCircle(col: number, row: number): boolean {
    const dc = col - BOSS_ARENA_CENTER.col;
    const dr = row - BOSS_ARENA_CENTER.row;
    return dc * dc + dr * dr <= BOSS_ARENA_DIRT_RADIUS * BOSS_ARENA_DIRT_RADIUS;
}

function buildBossArenaTerrain(): TerrainType[][] {
    const rows: TerrainType[][] = [];
    for (let r = 0; r < BOSS_ARENA_SIZE; r++) {
        const row: TerrainType[] = [];
        for (let c = 0; c < BOSS_ARENA_SIZE; c++) {
            row.push(isInDirtCircle(c, r) ? TerrainType.Dirt : TerrainType.Grass);
        }
        rows.push(row);
    }
    for (const rock of BOSS_ARENA_ROCKS) {
        rows[rock.row][rock.col] = TerrainType.Rock;
    }
    return rows;
}

export const MAP_SEGMENT_0_0_BOSS_ARENA: TerrainType[][] = buildBossArenaTerrain();
