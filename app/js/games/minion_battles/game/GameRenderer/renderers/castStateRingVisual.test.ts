import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { strokeClockwiseArc } from './castStateRingVisual';

function fakeGraphics() {
    const calls: Array<{ op: string; args: unknown[] }> = [];
    const rec =
        (op: string) =>
        (...args: unknown[]) => {
            calls.push({ op, args });
            return g;
        };
    const g = { moveTo: rec('moveTo'), arc: rec('arc'), circle: rec('circle'), stroke: rec('stroke') };
    return { g: g as unknown as Graphics, calls };
}

describe('strokeClockwiseArc', () => {
    it('moves the pen to the arc start before arc() so no spoke is drawn from the centre', () => {
        const { g, calls } = fakeGraphics();
        strokeClockwiseArc(g, 10, 0.5, { color: 0xffffff, width: 2 });
        expect(calls.map((c) => c.op)).toEqual(['moveTo', 'arc', 'stroke']);
        const [x, y] = calls[0].args as number[];
        expect(x).toBeCloseTo(0);
        expect(y).toBeCloseTo(-10);
    });

    it('offsets the start point by the centre', () => {
        const { g, calls } = fakeGraphics();
        strokeClockwiseArc(g, 10, 0.25, { color: 0xffffff, width: 2 }, 100, 50);
        const [x, y] = calls[0].args as number[];
        expect(x).toBeCloseTo(100);
        expect(y).toBeCloseTo(40);
        expect(calls[1].args.slice(0, 3)).toEqual([100, 50, 10]);
    });

    it('draws nothing at ~0 and a plain circle at ~1', () => {
        const a = fakeGraphics();
        strokeClockwiseArc(a.g, 10, 0, { color: 0, width: 1 });
        expect(a.calls).toEqual([]);
        const b = fakeGraphics();
        strokeClockwiseArc(b.g, 10, 1, { color: 0, width: 1 });
        expect(b.calls.map((c) => c.op)).toEqual(['circle', 'stroke']);
    });
});
