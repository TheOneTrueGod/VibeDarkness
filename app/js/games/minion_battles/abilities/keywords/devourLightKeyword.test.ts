import { describe, it, expect } from 'vitest';
import { LightSource } from '../../game/lightSources/LightSource';
import { LightSourceManager } from '../../game/lightSources/LightSourceManager';
import type { EngineContext } from '../../game/EngineContext';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getKeyword } from './keywordRegistry';
import type { KeywordContext } from './keywordTypes';

const CX = 500;
const CY = 500;

function makeSource(id: string, dx: number, dy: number, extra: Partial<ConstructorParameters<typeof LightSource>[0]> = {}) {
    return new LightSource({
        id,
        x: CX + dx,
        y: CY + dy,
        lightAmount: 4,
        radius: 2,
        decay: { roundCreated: 0, initialLightAmount: 4, initialRadius: 2, roundsTotal: 3 },
        ...extra,
    });
}

function setup(sources: LightSource[]) {
    const mgr = new LightSourceManager({} as EngineContext);
    sources.forEach((s) => mgr.addLightSource(s));
    const ctx = { engine: { state: { lightSourceManager: mgr } }, caster: { x: CX, y: CY } } as unknown as KeywordContext;
    return { mgr, ctx };
}

const resolve = (ctx: KeywordContext, n: number) => getKeyword('devourLight')!.resolve!(ctx, n);

describe('devourLight keyword', () => {
    it('is registered with the right tooltip', () => {
        expect(getKeyword('devourLight')?.formatTooltip(1)).toBe('Devour Light 1');
    });

    it('devours the nearest source only', () => {
        const near = makeSource('a', CELL_SIZE, 0);
        const far = makeSource('b', 2 * CELL_SIZE, 0);
        const { ctx } = setup([far, near]);
        expect(resolve(ctx, 1)).toEqual({ triggered: true });
        expect(near.active).toBe(false);
        expect(far.active).toBe(true);
    });

    it('does nothing when no source is in range', () => {
        const { ctx } = setup([]);
        expect(resolve(ctx, 1)).toEqual({ triggered: false });
    });

    it('ignores sources just beyond 2 tiles, includes the boundary', () => {
        const out = makeSource('out', 2 * CELL_SIZE + 1, 0);
        const outY = makeSource('outY', 0, -(2 * CELL_SIZE + 1));
        const edge = makeSource('edge', -2 * CELL_SIZE, 2 * CELL_SIZE);
        const { ctx } = setup([out, outY, edge]);
        expect(resolve(ctx, 1).triggered).toBe(true);
        expect(edge.active).toBe(false);
        expect(out.active).toBe(true);
        expect(outY.active).toBe(true);
        expect(resolve(ctx, 1).triggered).toBe(false);
    });

    it('ignores negative, base and inactive sources', () => {
        const neg = makeSource('neg', 10, 0, { lightAmount: -4 });
        const base = makeSource('base', 10, 0, { overlapMethod: { method: 'base' } as never });
        const inactive = makeSource('off', 10, 0);
        inactive.active = false;
        const { ctx } = setup([neg, base, inactive]);
        expect(resolve(ctx, 1).triggered).toBe(false);
        expect(neg.active).toBe(true);
        expect(base.active).toBe(true);
    });

    it('N=2 with only one available destroys nothing', () => {
        const only = makeSource('only', 10, 0);
        const { ctx } = setup([only]);
        expect(resolve(ctx, 2)).toEqual({ triggered: false });
        expect(only.active).toBe(true);
    });

    it('N=2 devours the two nearest', () => {
        const a = makeSource('a', 10, 0);
        const b = makeSource('b', 20, 0);
        const c = makeSource('c', 30, 0);
        const { ctx } = setup([c, b, a]);
        expect(resolve(ctx, 2).triggered).toBe(true);
        expect([a.active, b.active, c.active]).toEqual([false, false, true]);
    });

    it('breaks distance ties by id', () => {
        const z = makeSource('z', 10, 0);
        const m = makeSource('m', -10, 0);
        const { mgr, ctx } = setup([z, m]);
        expect(mgr.findDevourableLightSources(CX, CY, 2 * CELL_SIZE).map((s) => s.id)).toEqual(['m', 'z']);
        resolve(ctx, 1);
        expect(m.active).toBe(false);
        expect(z.active).toBe(true);
    });
});
