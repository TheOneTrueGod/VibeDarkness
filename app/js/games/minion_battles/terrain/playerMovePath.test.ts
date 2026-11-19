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
    resolvePlayerMoveTargetPixel,
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

describe('resolvePlayerMoveTargetPixel', () => {
    const grass = TerrainType.Grass;
    const rows = [
        [grass, grass, grass],
        [grass, TerrainType.Rock, grass],
        [grass, grass, grass],
    ];

    it('keeps a pixel inside the walkable final cell', () => {
        const tm = managerFromTypes(rows);
        const px = { x: 2 * 40 + 10, y: 0 * 40 + 30 };
        expect(resolvePlayerMoveTargetPixel(tm, [{ col: 2, row: 0 }], px, 20, 20)).toEqual(px);
    });

    it('drops a pixel inside an unwalkable cell (path snapped to a neighbour)', () => {
        const tm = managerFromTypes(rows);
        const path = buildPlayerMovePathThroughWaypoints(tm, 0, 1, [{ col: 1, row: 1 }])!;
        const px = { x: 1 * 40 + 20, y: 1 * 40 + 20 };
        expect(resolvePlayerMoveTargetPixel(tm, path, px, 20, 60)).toBeUndefined();
    });

    it('drops a pixel whose last leg is blocked by rock', () => {
        const tm = managerFromTypes([
            [grass, TerrainType.Rock, grass],
            [grass, grass, grass],
        ]);
        // From the centre of (0,0) straight to a pixel in (2,0) crosses the rock at (1,0).
        expect(resolvePlayerMoveTargetPixel(tm, [{ col: 2, row: 0 }], { x: 100, y: 20 }, 20, 20)).toBeUndefined();
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
