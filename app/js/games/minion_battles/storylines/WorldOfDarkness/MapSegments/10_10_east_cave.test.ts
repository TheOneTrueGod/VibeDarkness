import { describe, it, expect } from 'vitest';
import { TerrainType } from '../../../terrain/TerrainType';
import { getSegment } from '../../../terrain/segmentRegistry';
import { registerWorldOfDarknessSegments } from '../registerSegments';
import {
    MAP_SEGMENT_50_50_CRYSTAL_CAVE,
    CRYSTAL_CAVE_CHAMBER,
    HOME_PLAYER_SPAWN_OFFSETS,
} from './50_50_crystal_cave';
import {
    EAST_CAVE_CAMPFIRE,
    EAST_CAVE_GRID_COL,
    EAST_CAVE_GRID_ROW,
    EAST_CAVE_SEGMENT_ID,
    EAST_CAVE_SIZE,
    EAST_WALL_OPENING_COL,
    EAST_WALL_OPENING_ROW,
    EAST_WALL_OPENING_SIZE,
    MAP_SEGMENT_10_10_EAST_CAVE,
} from './10_10_east_cave';

registerWorldOfDarknessSegments();

function inChamber(col: number, row: number): boolean {
    return (
        col >= CRYSTAL_CAVE_CHAMBER.colStart &&
        col <= CRYSTAL_CAVE_CHAMBER.colEnd &&
        row >= CRYSTAL_CAVE_CHAMBER.rowStart &&
        row <= CRYSTAL_CAVE_CHAMBER.rowEnd
    );
}

function inEastOpening(col: number, row: number): boolean {
    return (
        col >= EAST_WALL_OPENING_COL &&
        col < EAST_WALL_OPENING_COL + EAST_WALL_OPENING_SIZE &&
        row >= EAST_WALL_OPENING_ROW &&
        row < EAST_WALL_OPENING_ROW + EAST_WALL_OPENING_SIZE
    );
}

function mirroredSource(col: number, row: number): TerrainType {
    const srcCol = CRYSTAL_CAVE_CHAMBER.colStart + CRYSTAL_CAVE_CHAMBER.colEnd - col;
    return MAP_SEGMENT_50_50_CRYSTAL_CAVE[row]![srcCol]!;
}

describe('10_10 east cave home', () => {
    it('is a rock tile with a 2x2 hole on the east wall', () => {
        expect(MAP_SEGMENT_10_10_EAST_CAVE).toHaveLength(EAST_CAVE_SIZE);
        expect(MAP_SEGMENT_10_10_EAST_CAVE[0]).toHaveLength(EAST_CAVE_SIZE);

        const eastCol = EAST_CAVE_SIZE - 1;
        let openingDirt = 0;
        for (let r = 0; r < EAST_CAVE_SIZE; r++) {
            for (let c = 0; c < EAST_CAVE_SIZE; c++) {
                const cell = MAP_SEGMENT_10_10_EAST_CAVE[r]![c];
                if (inEastOpening(c, r)) {
                    expect(cell).toBe(TerrainType.Dirt);
                    if (c === eastCol) openingDirt += 1;
                    continue;
                }
                if (!inChamber(c, r) || c === eastCol) {
                    expect(cell).toBe(TerrainType.Rock);
                }
            }
        }
        expect(openingDirt).toBe(EAST_WALL_OPENING_SIZE);
    });

    it('mirrors the 50_50 cave chamber beside that opening', () => {
        const eastCol = EAST_CAVE_SIZE - 1;
        for (let r = CRYSTAL_CAVE_CHAMBER.rowStart; r <= CRYSTAL_CAVE_CHAMBER.rowEnd; r++) {
            for (let c = CRYSTAL_CAVE_CHAMBER.colStart; c <= CRYSTAL_CAVE_CHAMBER.colEnd; c++) {
                if (c === eastCol || inEastOpening(c, r)) continue;
                expect(MAP_SEGMENT_10_10_EAST_CAVE[r]![c]).toBe(mirroredSource(c, r));
            }
        }
    });

    it('keeps the campfire and home spawns on cave dirt', () => {
        expect(MAP_SEGMENT_10_10_EAST_CAVE[EAST_CAVE_CAMPFIRE.row]![EAST_CAVE_CAMPFIRE.col]).toBe(
            TerrainType.Dirt,
        );
        for (const offset of HOME_PLAYER_SPAWN_OFFSETS) {
            const col = EAST_CAVE_CAMPFIRE.col + offset.dCol;
            const row = EAST_CAVE_CAMPFIRE.row + offset.dRow;
            expect(MAP_SEGMENT_10_10_EAST_CAVE[row]![col]).toBe(TerrainType.Dirt);
        }
    });

    it('registers campfire and player-spawn POIs as a home tile', () => {
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
    });
});
