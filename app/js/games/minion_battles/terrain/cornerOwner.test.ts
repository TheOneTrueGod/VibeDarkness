import { describe, expect, it } from 'vitest';
import { TerrainType } from './TerrainType';
import { CORNER_FALLBACK_TERRAIN, cellReachesVertex, resolveVertexOwner } from './cornerOwner';

const g = TerrainType.Grass;
const d = TerrainType.Dirt;
const r = TerrainType.Rock;
const v = TerrainType.Gravel;
const s = TerrainType.ShallowWater;
const w = TerrainType.Water;
const x = TerrainType.Briar;

/** Row-major lookup; out of bounds reads as Grass. */
function lookup(cells: TerrainType[][]): (c: number, r: number) => TerrainType {
    return (c, row) => cells[row]?.[c] ?? g;
}

describe('cellReachesVertex', () => {
    it('soft terrain always reaches its corners', () => {
        const get = lookup([[g, g], [g, d]]);
        expect(cellReachesVertex(1, 1, 1, 1, get)).toBe(true);
    });

    it('a hard-edge cell does not reach a corner it cuts (both sides there are another family)', () => {
        const get = lookup([[g, g], [g, r]]);
        expect(cellReachesVertex(1, 1, 1, 1, get)).toBe(false);
    });

    it('a hard-edge cell reaches a corner when one side there is its own family', () => {
        // Gravel counts Rock as family, so gravel north of rock runs square into the shared corner.
        const get = lookup([[g, v, g], [g, r, g]]);
        expect(cellReachesVertex(1, 0, 2, 1, get)).toBe(true);
    });
});

describe('resolveVertexOwner', () => {
    it('rock inside a gravel cross: gravel owns the corner, not the grass diagonal', () => {
        const get = lookup([
            [g, v, g],
            [v, r, v],
            [g, v, g],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(v);
        expect(resolveVertexOwner(2, 1, get)).toBe(v);
        expect(resolveVertexOwner(1, 2, get)).toBe(v);
        expect(resolveVertexOwner(2, 2, get)).toBe(v);
    });

    it('breaks a one-each tie by draw order (gravel over dirt over grass)', () => {
        const get = lookup([
            [g, d, g],
            [v, r, v],
            [g, v, g],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(v);
    });

    it('rocks touching only at a corner do not own it; the surrounding grass does', () => {
        const get = lookup([
            [r, g],
            [g, r],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(g);
    });

    it('rocks touching at a corner inside rubble: gravel owns it', () => {
        const get = lookup([
            [v, r, v],
            [r, v, r],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(v);
    });

    it('soft terrain only: the majority wins over the diagonal', () => {
        const get = lookup([
            [w, s],
            [r, w],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(w);
    });

    it('falls back to the base ground when no cell reaches the corner', () => {
        const get = lookup([
            [r, x],
            [x, r],
        ]);
        expect(resolveVertexOwner(1, 1, get)).toBe(CORNER_FALLBACK_TERRAIN);
    });
});
