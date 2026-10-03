import { describe, expect, it } from 'vitest';
import { TerrainGrid } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { TerrainManager } from './TerrainManager';
import { TerrainLayerManager } from '../game/TerrainLayerManager';
import {
    bresenhamGridLine,
    buildPlayerMovePathThroughWaypoints,
    concatGridMoveSegments,
    isDirectGridLineTraversable,
    resolvePlayerMoveSegment,
} from './playerMovePath';

function managerFromTypes(rows: TerrainType[][]): TerrainManager {
    const grid = TerrainGrid.fromArray(rows, 40);
    const tm = new TerrainManager(grid);
    tm.setTerrainLayers(new TerrainLayerManager());
    return tm;
}

describe('bresenhamGridLine', () => {
    it('returns inclusive endpoints for axis-aligned lines', () => {
        expect(bresenhamGridLine(0, 0, 3, 0)).toEqual([
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 2, row: 0 },
            { col: 3, row: 0 },
        ]);
    });

    it('returns diagonal steps for diagonal lines', () => {
        expect(bresenhamGridLine(0, 0, 2, 2)).toEqual([
            { col: 0, row: 0 },
            { col: 1, row: 1 },
            { col: 2, row: 2 },
        ]);
    });
});

describe('isDirectGridLineTraversable', () => {
    it('returns false when the line crosses bedrock rock', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        expect(isDirectGridLineTraversable(tm, 0, 1, 2, 1)).toBe(false);
    });

    it('returns true for clear grass line', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        expect(isDirectGridLineTraversable(tm, 0, 0, 2, 0)).toBe(true);
    });

    it('returns false when a created rock blocks the line', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        // Line is clear initially.
        expect(isDirectGridLineTraversable(tm, 0, 1, 2, 1)).toBe(true);
        // Create a rock on the direct line.
        tm.createOrMarkRock(1, 1);
        tm.clearPathCache();
        // Now the line is blocked.
        expect(isDirectGridLineTraversable(tm, 0, 1, 2, 1)).toBe(false);
    });
});

describe('resolvePlayerMoveSegment', () => {
    it('uses a single destination cell when the grid line is unobstructed (straight world move)', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        const p = resolvePlayerMoveSegment(tm, 0, 0, 2, 0);
        expect(p).toEqual([{ col: 2, row: 0 }]);
    });

    it('falls back to A* when line crosses rock', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Rock, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        const direct = resolvePlayerMoveSegment(tm, 0, 0, 2, 0);
        expect(direct?.find((c) => c.col === 1 && c.row === 0)).toBeUndefined();
        expect(direct?.[direct.length - 1]).toEqual({ col: 2, row: 0 });
    });
});

describe('concatGridMoveSegments', () => {
    it('drops duplicate junction cell', () => {
        expect(concatGridMoveSegments([{ col: 0, row: 0 }, { col: 1, row: 0 }], [{ col: 1, row: 0 }, { col: 1, row: 1 }])).toEqual([
            { col: 0, row: 0 },
            { col: 1, row: 0 },
            { col: 1, row: 1 },
        ]);
    });
});

describe('buildPlayerMovePathThroughWaypoints', () => {
    it('chains two clear segments', () => {
        const tm = managerFromTypes([
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
            [TerrainType.Grass, TerrainType.Grass, TerrainType.Grass, TerrainType.Grass],
        ]);
        const path = buildPlayerMovePathThroughWaypoints(tm, 0, 0, [
            { col: 2, row: 0 },
            { col: 2, row: 1 },
        ]);
        expect(path).toEqual([{ col: 2, row: 0 }, { col: 2, row: 1 }]);
    });
});
