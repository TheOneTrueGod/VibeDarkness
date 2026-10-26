import { describe, it, expect } from 'vitest';
import { TerrainType } from '../../../terrain/TerrainType';
import { getSegment } from '../../../terrain/segmentRegistry';
import { findPath } from '../../../terrain/mapTools';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import { CRYSTAL_DAYLIGHT_RADIUS, HOME_PLAYER_SPAWN_OFFSETS } from './50_50_crystal_cave';
import {
    EAST_CAVE_CAMPFIRE,
    EAST_CAVE_CRYSTAL_POINTS,
    EAST_CAVE_GRID_COL,
    EAST_CAVE_GRID_ROW,
    EAST_CAVE_MOUTH,
    EAST_CAVE_NETWORK,
    EAST_CAVE_SEGMENT_ID,
    EAST_CAVE_SIZE,
    EAST_WALL_OPENING_COL,
    EAST_WALL_OPENING_ROW,
    EAST_WALL_OPENING_SIZE,
    MAP_SEGMENT_10_10_EAST_CAVE,
} from './10_10_east_cave';

registerWorldOfDarknessSegments();

const cave = MAP_SEGMENT_10_10_EAST_CAVE;
const crystals = Object.values(EAST_CAVE_CRYSTAL_POINTS);

function inEastOpening(col: number, row: number): boolean {
    return (
        col >= EAST_WALL_OPENING_COL &&
        col < EAST_WALL_OPENING_COL + EAST_WALL_OPENING_SIZE &&
        row >= EAST_WALL_OPENING_ROW &&
        row < EAST_WALL_OPENING_ROW + EAST_WALL_OPENING_SIZE
    );
}

describe('10_10 east cave home', () => {
    it('is enclosed by rock except for the 2x2 hole on the east wall', () => {
        expect(cave).toHaveLength(EAST_CAVE_SIZE);
        for (const row of cave) expect(row).toHaveLength(EAST_CAVE_SIZE);

        const last = EAST_CAVE_SIZE - 1;
        for (let i = 0; i < EAST_CAVE_SIZE; i++) {
            expect(cave[0]![i]).toBe(TerrainType.Rock);
            expect(cave[last]![i]).toBe(TerrainType.Rock);
            expect(cave[i]![0]).toBe(TerrainType.Rock);
            expect(cave[i]![last]).toBe(inEastOpening(last, i) ? TerrainType.Dirt : TerrainType.Rock);
        }
        for (let r = EAST_WALL_OPENING_ROW; r < EAST_WALL_OPENING_ROW + EAST_WALL_OPENING_SIZE; r++) {
            for (let c = EAST_WALL_OPENING_COL; c < EAST_CAVE_SIZE; c++) {
                expect(cave[r]![c]).toBe(TerrainType.Dirt);
            }
        }
    });

    it('keeps the campfire and home spawns on cave dirt, reachable from the mouth', () => {
        expect(cave[EAST_CAVE_CAMPFIRE.row]![EAST_CAVE_CAMPFIRE.col]).toBe(TerrainType.Dirt);
        for (const offset of HOME_PLAYER_SPAWN_OFFSETS) {
            const col = EAST_CAVE_CAMPFIRE.col + offset.dCol;
            const row = EAST_CAVE_CAMPFIRE.row + offset.dRow;
            expect(cave[row]![col]).toBe(TerrainType.Dirt);
        }
        expect(findPath(cave, EAST_CAVE_MOUTH, EAST_CAVE_CAMPFIRE)).not.toBeNull();
    });

    it('rings the chamber with crystal light spots that cover every floor cell', () => {
        for (const pt of crystals) expect(cave[pt.row]![pt.col]).toBe(TerrainType.Dirt);
        // Chamber = dirt west of the tunnel; the campfire tile itself is a light, so it is skipped.
        for (let r = 0; r < EAST_CAVE_SIZE; r++) {
            for (let c = 0; c < EAST_WALL_OPENING_COL - 3; c++) {
                if (cave[r]![c] !== TerrainType.Dirt) continue;
                if (c === EAST_CAVE_CAMPFIRE.col && r === EAST_CAVE_CAMPFIRE.row) continue;
                const nearest = Math.min(...crystals.map((p) => Math.hypot(p.col - c, p.row - r)));
                expect(nearest, `cell (${c},${r})`).toBeLessThanOrEqual(CRYSTAL_DAYLIGHT_RADIUS);
            }
        }
    });

    it('stays connected with crystals in place (crystals never cut off the campfire)', () => {
        const blocked = cave.map((row) => [...row]);
        for (const pt of crystals) blocked[pt.row]![pt.col] = TerrainType.Rock;
        expect(findPath(blocked, EAST_CAVE_MOUTH, EAST_CAVE_CAMPFIRE)).not.toBeNull();
    });

    it('registers campfire, player-spawn, crystal POIs and the mouth network node', () => {
        const segment = getSegment(EAST_CAVE_SEGMENT_ID);
        expect(segment).toMatchObject({
            id: EAST_CAVE_SEGMENT_ID,
            gridCol: EAST_CAVE_GRID_COL,
            gridRow: EAST_CAVE_GRID_ROW,
        });
        expect(segment?.pointsOfInterest.filter((p) => p.type === 'campfire')).toEqual([
            expect.objectContaining({
                col: EAST_CAVE_CAMPFIRE.col,
                row: EAST_CAVE_CAMPFIRE.row,
            }),
        ]);
        expect(segment?.pointsOfInterest.filter((p) => p.type === 'playerSpawn')).toHaveLength(
            HOME_PLAYER_SPAWN_OFFSETS.length,
        );
        expect(segment?.pointsOfInterest.filter((p) => p.type === 'crystal')).toHaveLength(crystals.length);
        expect(segment?.network).toEqual(EAST_CAVE_NETWORK);
    });
});
