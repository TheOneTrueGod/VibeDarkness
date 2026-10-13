import { describe, expect, it } from 'vitest';
import { computeArcLandingSlots, selectNearestToPointInCone } from './gatherHelpers';
import type { Unit } from '../game/units/Unit';

function unit(id: string, x: number, y: number, teamId = 'enemy'): Unit {
    return { id, x, y, teamId, radius: 10, isAlive: () => true } as unknown as Unit;
}
const caster = { x: 0, y: 0, teamId: 'player' } as Unit;
const base = { caster, aim: { x: 100, y: 0 }, cursor: { x: 100, y: 0 }, length: 110, widthDeg: 70, maxTargets: 3 };
const rad = (d: number) => (d * Math.PI) / 180;

describe('selectNearestToPointInCone', () => {
    it('includes cone edge and excludes beyond length / angle / allies', () => {
        const a = unit('a', 110, 0);
        const b = unit('b', 111, 0);
        const edge = unit('edge', Math.cos(rad(34.9)) * 50, Math.sin(rad(34.9)) * 50);
        const out = unit('out', Math.cos(rad(36)) * 50, Math.sin(rad(36)) * 50);
        const ally = unit('ally', 50, 0, 'player');
        const res = selectNearestToPointInCone({ ...base, units: [a, b, edge, out, ally] });
        expect(res.map((u) => u.id).sort()).toEqual(['a', 'edge']);
    });

    it('sorts by distance to cursor and caps at maxTargets', () => {
        const units = [unit('far', 20, 0), unit('c', 90, 5), unit('d', 60, 0), unit('near', 100, 0)];
        const res = selectNearestToPointInCone({ ...base, units });
        expect(res.map((u) => u.id)).toEqual(['near', 'c', 'd']);
    });

    it('ranks by cursor, not aim, and breaks ties by id', () => {
        const res = selectNearestToPointInCone({
            ...base,
            cursor: { x: 20, y: 0 },
            units: [unit('z', 40, 0), unit('a', 40, 0), unit('m', 90, 0)],
        });
        expect(res.map((u) => u.id)).toEqual(['a', 'z', 'm']);
    });

    it('applies custom filter', () => {
        const res = selectNearestToPointInCone({
            ...base,
            units: [unit('a', 50, 0), unit('b', 60, 0)],
            filter: (u) => u.id !== 'a',
        });
        expect(res.map((u) => u.id)).toEqual(['b']);
    });
});

describe('computeArcLandingSlots', () => {
    const c = { x: 0, y: 0, radius: 15 };
    const opts = { caster: c, aim: { x: 50, y: 0 }, radiusFromEdge: 20, spreadDeg: 25 };
    const ang = (s: { x: number; y: number }) => (Math.atan2(s.y, s.x) * 180) / Math.PI;

    it('1 slot is centred on aim at caster edge + spacing', () => {
        const [s] = computeArcLandingSlots({ ...opts, count: 1 });
        expect(s.x).toBeCloseTo(35, 6);
        expect(s.y).toBeCloseTo(0, 6);
    });

    it('3 slots: centre first, then +side, then -side at +/- spread, equal radius', () => {
        const slots = computeArcLandingSlots({ ...opts, count: 3 });
        expect(slots[0].y).toBeCloseTo(0, 6);
        expect(ang(slots[1])).toBeCloseTo(25, 6);
        expect(ang(slots[2])).toBeCloseTo(-25, 6);
        for (const s of slots) expect(Math.hypot(s.x, s.y)).toBeCloseTo(35, 6);
    });

    it('2 slots: centre then one side at spread; 0 slots empty; targetRadius widens arc', () => {
        const two = computeArcLandingSlots({ ...opts, count: 2 });
        expect(ang(two[1])).toBeCloseTo(25, 6);
        expect(computeArcLandingSlots({ ...opts, count: 0 })).toEqual([]);
        const [w] = computeArcLandingSlots({ ...opts, count: 1, targetRadius: 10 });
        expect(w.x).toBeCloseTo(45, 6);
    });

    it('rotates with aim direction', () => {
        const [s] = computeArcLandingSlots({ ...opts, aim: { x: 0, y: 50 }, count: 1 });
        expect(s.x).toBeCloseTo(0, 6);
        expect(s.y).toBeCloseTo(35, 6);
    });
});
