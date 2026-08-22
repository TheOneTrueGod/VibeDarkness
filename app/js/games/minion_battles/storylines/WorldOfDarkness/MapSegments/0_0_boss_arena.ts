/**
 * 0_0 Boss arena — encounter tile (not a World of Darkness overworld address).
 * Layout-composer missions place this by layout cell, so it can sit next to a home tile.
 * Grass field with a large dirt circle and a few interior rocks.
 */

import { TerrainType } from '../../../terrain/TerrainType';
import { EAST_WALL_OPENING_ROW } from './10_10_east_cave';

export const BOSS_ARENA_SEGMENT_ID = '0_0_boss_arena';
export const BOSS_ARENA_GRID_COL = 0;
export const BOSS_ARENA_GRID_ROW = 0;
export const BOSS_ARENA_SIZE = 22;
export const BOSS_ARENA_CENTER = { col: 11, row: 11 } as const;
export const BOSS_ARENA_DIRT_RADIUS = 7;
/** West tangent of the dirt circle — the path from the cave meets the ring here. */
export const BOSS_ARENA_CIRCLE_WEST_COL = BOSS_ARENA_CENTER.col - BOSS_ARENA_DIRT_RADIUS;
/** Dirt trail on the west grass: cave-mouth rows down to the circle's left edge. */
export const ARENA_WEST_PATH_ROW_START = EAST_WALL_OPENING_ROW;
export const ARENA_WEST_PATH_ROW_END = BOSS_ARENA_CENTER.row;
export const ARENA_WEST_PATH_COL_START = 0;
export const ARENA_WEST_PATH_COL_END = BOSS_ARENA_CIRCLE_WEST_COL;
/** Ring radius (tiles) for arena spawn crystals — inside the dirt disk, off the west cave mouth. */
export const ARENA_RING_SPAWN_RADIUS = 6;
/**
 * Compass degrees from east, counterclockwise, skipping due-west (180°) where the home cave attaches.
 * Seven of eight octagon vertices.
 */
export const ARENA_RING_SPAWN_ANGLES_DEG = [0, 45, 90, 135, 225, 270, 315] as const;
export const ARENA_RING_SPAWN_COUNT = ARENA_RING_SPAWN_ANGLES_DEG.length;

function pointOnArenaRing(angleDeg: number): { col: number; row: number } {
    const rad = (angleDeg * Math.PI) / 180;
    return {
        col: BOSS_ARENA_CENTER.col + Math.round(ARENA_RING_SPAWN_RADIUS * Math.cos(rad)),
        row: BOSS_ARENA_CENTER.row + Math.round(ARENA_RING_SPAWN_RADIUS * Math.sin(rad)),
    };
}

export const ARENA_RING_SPAWN_POINTS: readonly { col: number; row: number }[] =
    ARENA_RING_SPAWN_ANGLES_DEG.map(pointOnArenaRing);

export function rightmostArenaRingSpawnPoints(count: number): { col: number; row: number }[] {
    return [...ARENA_RING_SPAWN_POINTS]
        .sort((a, b) => b.col - a.col || a.row - b.row)
        .slice(0, count);
}

/** Interior cover; kept off the western approach so the 10_10 cave mouth stays clear. */
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

function isOnWestCavePath(col: number, row: number): boolean {
    return (
        col >= ARENA_WEST_PATH_COL_START &&
        col <= ARENA_WEST_PATH_COL_END &&
        row >= ARENA_WEST_PATH_ROW_START &&
        row <= ARENA_WEST_PATH_ROW_END
    );
}

function buildBossArenaTerrain(): TerrainType[][] {
    const rows: TerrainType[][] = [];
    for (let r = 0; r < BOSS_ARENA_SIZE; r++) {
        const row: TerrainType[] = [];
        for (let c = 0; c < BOSS_ARENA_SIZE; c++) {
            row.push(isInDirtCircle(c, r) || isOnWestCavePath(c, r) ? TerrainType.Dirt : TerrainType.Grass);
        }
        rows.push(row);
    }
    for (const rock of BOSS_ARENA_ROCKS) {
        rows[rock.row][rock.col] = TerrainType.Rock;
    }
    return rows;
}

export const MAP_SEGMENT_0_0_BOSS_ARENA: TerrainType[][] = buildBossArenaTerrain();
