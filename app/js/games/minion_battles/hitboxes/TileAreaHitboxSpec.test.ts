import { describe, expect, it } from 'vitest';
import { tileAreaHitbox, tileShapes } from './TileAreaHitboxSpec';
import { getTileAreaEdges, getTileAreaOutlineLoops } from '../abilities/tileAreaHelpers';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { Unit } from '../game/units/Unit';

/** World point at the centre of tile (col, row). */
const at = (col: number, row: number): { x: number; y: number } => ({
    x: (col + 0.5) * CELL_SIZE,
    y: (row + 0.5) * CELL_SIZE,
});

const CASTER_TILE = { col: 5, row: 5 };
const caster = at(CASTER_TILE.col, CASTER_TILE.row);

const chebyshev2 = (shape: ReturnType<typeof tileShapes.single>) =>
    tileAreaHitbox({ anchor: { kind: 'chebyshev', maxTileOffset: 2 }, shape, castRange: 160 });

const adjacent = (shape: ReturnType<typeof tileShapes.single>) =>
    tileAreaHitbox({ anchor: { kind: 'adjacentCardinal' }, shape, castRange: 160 });

describe('TileAreaHitboxSpec anchors', () => {
    it('chebyshev clamps each axis independently to maxTileOffset', () => {
        const hb = chebyshev2(tileShapes.single());
        expect(hb.resolveAnchor(caster, at(20, 5))).toEqual({ col: 7, row: 5 });
        expect(hb.resolveAnchor(caster, at(20, 20))).toEqual({ col: 7, row: 7 });
        expect(hb.resolveAnchor(caster, at(0, 0))).toEqual({ col: 3, row: 3 });
        // in range: unchanged
        expect(hb.resolveAnchor(caster, at(6, 4))).toEqual({ col: 6, row: 4 });
    });

    it('chebyshev with aim on the caster anchors on the caster tile (never null)', () => {
        const hb = chebyshev2(tileShapes.single());
        expect(hb.resolveAnchor(caster, caster)).toEqual(CASTER_TILE);
    });

    it('adjacentCardinal picks the neighbour on the dominant axis', () => {
        const hb = adjacent(tileShapes.single());
        expect(hb.resolveAnchor(caster, at(9, 5))).toEqual({ col: 6, row: 5 }); // east
        expect(hb.resolveAnchor(caster, at(1, 5))).toEqual({ col: 4, row: 5 }); // west
        expect(hb.resolveAnchor(caster, at(6, 3))).toEqual({ col: 5, row: 4 }); // dy dominates: north
        expect(hb.resolveAnchor(caster, at(5, 9))).toEqual({ col: 5, row: 6 }); // south
    });

    it('adjacentCardinal aimed exactly on the caster has no anchor and no cells', () => {
        const hb = adjacent(tileShapes.single());
        expect(hb.resolveAnchor(caster, caster)).toBeNull();
        expect(hb.resolveCells(caster, caster)).toEqual([]);
    });

    it('resolveCells is the anchor expanded by the shape', () => {
        const hb = chebyshev2(tileShapes.square(1));
        expect(hb.resolveCells(caster, at(20, 5))).toEqual(hb.cellsAround({ col: 7, row: 5 }));
    });
});

describe('TileAreaHitboxSpec cells per preset', () => {
    it('single is just the anchor', () => {
        expect(tileShapes.single()).toEqual([{ dCol: 0, dRow: 0 }]);
    });

    it('square(1) is 9 cells, row-major from the top-left', () => {
        const cells = chebyshev2(tileShapes.square(1)).cellsAround({ col: 7, row: 5 });
        expect(cells).toHaveLength(9);
        expect(cells[0]).toEqual({ col: 6, row: 4 });
        expect(cells[4]).toEqual({ col: 7, row: 5 });
        expect(cells[8]).toEqual({ col: 8, row: 6 });
    });

    it('plus is 5 cells with the centre first, then N, E, S, W', () => {
        const cells = chebyshev2(tileShapes.plus()).cellsAround({ col: 7, row: 5 });
        expect(cells).toEqual([
            { col: 7, row: 5 },
            { col: 7, row: 4 },
            { col: 8, row: 5 },
            { col: 7, row: 6 },
            { col: 6, row: 5 },
        ]);
    });
});

describe('TileAreaHitboxSpec outlines', () => {
    it('single outlines 4 edges and has no interior edges', () => {
        const cells = tileShapes.single().map((o) => ({ col: o.dCol, row: o.dRow }));
        const { outer, interior } = getTileAreaEdges(cells);
        expect(outer).toHaveLength(4);
        expect(interior).toHaveLength(0);
        expect(getTileAreaOutlineLoops(cells)).toHaveLength(1);
    });

    it('plus outlines 12 edges as one loop, with 4 interior edges', () => {
        const cells = chebyshev2(tileShapes.plus()).cellsAround({ col: 5, row: 5 });
        const { outer, interior } = getTileAreaEdges(cells);
        expect(outer).toHaveLength(12);
        expect(interior).toHaveLength(4);
        const loops = getTileAreaOutlineLoops(cells);
        expect(loops).toHaveLength(1);
        expect(loops[0]).toHaveLength(12);
    });

    it('3x3 square outlines 12 edges, with 12 interior grid edges', () => {
        const cells = chebyshev2(tileShapes.square(1)).cellsAround({ col: 5, row: 5 });
        const { outer, interior } = getTileAreaEdges(cells);
        expect(outer).toHaveLength(12);
        expect(interior).toHaveLength(12);
        expect(getTileAreaOutlineLoops(cells)).toHaveLength(1);
    });
});

describe('TileAreaHitboxSpec construction and contract', () => {
    it('rejects directionArrow with a chebyshev anchor', () => {
        expect(() => tileAreaHitbox({
            anchor: { kind: 'chebyshev', maxTileOffset: 1 },
            shape: tileShapes.single(),
            castRange: 10,
            directionArrow: true,
        })).toThrow();
    });

    it('rejects an empty shape', () => {
        expect(() => tileAreaHitbox({
            anchor: { kind: 'adjacentCardinal' },
            shape: [],
            castRange: 10,
        })).toThrow();
    });

    it('is ground-only: no lock-on, no hits, and a nominal range', () => {
        const hb = adjacent(tileShapes.single());
        expect(hb.numTargets).toBe(0);
        expect(hb.maxRange).toBe(160);
        expect(hb.resolveTargets({} as Unit, at(9, 5), [])).toEqual([]);
        expect(hb.resolveHits({} as never, {} as Unit, 0, 0)).toEqual([]);
    });

    it('preview draws the telegraph and an arrow for a direction pick, and returns no candidates', () => {
        // The arrow is opt-in (Rock Slide's direction pick sets it), so this case enables it explicitly.
        const hb = tileAreaHitbox({
            anchor: { kind: 'adjacentCardinal' },
            shape: tileShapes.single(),
            castRange: 160,
            directionArrow: true,
        });
        const calls: string[] = [];
        const gr = {
            clear: () => calls.push('clear'),
            moveTo: () => calls.push('moveTo'),
            lineTo: () => calls.push('lineTo'),
            circle: () => calls.push('circle'),
            fill: () => calls.push('fill'),
            stroke: () => calls.push('stroke'),
        };
        const out = hb.renderTargetingPreview(gr, caster as never, at(9, 5), []);
        expect(out).toEqual([]);
        expect(calls[0]).toBe('clear');
        // The telegraph fills its one cell and strokes its outline once; the arrow fills and strokes once.
        expect(calls.filter((c) => c === 'fill')).toHaveLength(2);
        expect(calls.filter((c) => c === 'stroke')).toHaveLength(2);
    });
});
