import { describe, expect, it } from 'vitest';
import { FORMATION_PRESETS, assignUnitsToSlots, formationFacing, formationSlots } from './formationDef';
import { pickRetreatPoint } from '../units/unitAI/aiRetreatPoint';

const caster = { x: 100, y: 100 };
const target = { x: 300, y: 100 }; // due east
const ctx = { caster, target };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('formationSlots', () => {
    it('faces from caster to target, east when they coincide', () => {
        expect(formationFacing(ctx)).toEqual({ x: 1, y: 0 });
        expect(formationFacing({ caster, target: caster })).toEqual({ x: 1, y: 0 });
    });

    it('rings: evenly spaced on the radius around their anchor', () => {
        const slots = formationSlots(FORMATION_PRESETS.ringAroundCaster, 6, ctx);
        expect(slots).toHaveLength(6);
        for (const s of slots) expect(dist(s, caster)).toBeCloseTo(FORMATION_PRESETS.ringAroundCaster.radius);
        // First slot points at the target (no rotation on this preset).
        expect(slots[0]!.x).toBeCloseTo(caster.x + FORMATION_PRESETS.ringAroundCaster.radius);
        const aroundTarget = formationSlots(FORMATION_PRESETS.ringAroundTarget, 4, ctx);
        for (const s of aroundTarget) expect(dist(s, target)).toBeCloseTo(FORMATION_PRESETS.ringAroundTarget.radius);
    });

    it('line: marches from the caster toward the target', () => {
        const { startOffset, spacing } = FORMATION_PRESETS.lineFromCaster;
        const slots = formationSlots(FORMATION_PRESETS.lineFromCaster, 3, ctx);
        expect(slots.map((s) => s.x)).toEqual([100 + startOffset, 100 + startOffset + spacing, 100 + startOffset + 2 * spacing]);
        for (const s of slots) expect(s.y).toBeCloseTo(100);
    });

    it('wall: a line across the facing, centred in front of the caster', () => {
        const { forwardOffset, spacing } = FORMATION_PRESETS.wallFacingTarget;
        const slots = formationSlots(FORMATION_PRESETS.wallFacingTarget, 5, ctx);
        for (const s of slots) expect(s.x).toBeCloseTo(caster.x + forwardOffset);
        const ys = slots.map((s) => s.y);
        expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(4 * spacing);
        expect(ys.reduce((a, b) => a + b, 0) / ys.length).toBeCloseTo(caster.y);
    });

    it('box: every slot on the square perimeter around the target', () => {
        const h = FORMATION_PRESETS.boxAroundTarget.halfSize;
        const slots = formationSlots(FORMATION_PRESETS.boxAroundTarget, 8, ctx);
        expect(slots).toHaveLength(8);
        for (const s of slots) {
            const onEdge = Math.abs(Math.abs(s.x - target.x) - h) < 1e-6 || Math.abs(Math.abs(s.y - target.y) - h) < 1e-6;
            expect(onEdge).toBe(true);
            expect(Math.abs(s.x - target.x)).toBeLessThanOrEqual(h + 1e-6);
            expect(Math.abs(s.y - target.y)).toBeLessThanOrEqual(h + 1e-6);
        }
    });

    it('returns nothing for a zero count', () => {
        expect(formationSlots(FORMATION_PRESETS.ringAroundCaster, 0, ctx)).toEqual([]);
    });
});

describe('assignUnitsToSlots', () => {
    it('pairs shortest moves first and skips extras', () => {
        const units = [
            { id: 'a', x: 0, y: 0 },
            { id: 'b', x: 100, y: 0 },
            { id: 'c', x: 500, y: 500 },
        ];
        const out = assignUnitsToSlots(units, [{ x: 98, y: 0 }, { x: 2, y: 0 }]);
        expect(out).toEqual([
            { unitId: 'a', slot: { x: 2, y: 0 } },
            { unitId: 'b', slot: { x: 98, y: 0 } },
        ]);
    });
});

describe('pickRetreatPoint', () => {
    it('picks the open sample farthest from the nearest threat, at least minHop away', () => {
        const p = pickRetreatPoint({
            anchor: { x: 0, y: 0 },
            radius: 300,
            from: { x: 0, y: 0 },
            threats: [{ x: 200, y: 0 }],
            minHop: 150,
            isOpen: () => true,
        })!;
        expect(p.x).toBeCloseTo(-300);
        expect(p.y).toBeCloseTo(0);
        const none = pickRetreatPoint({ anchor: { x: 0, y: 0 }, radius: 100, from: { x: 0, y: 0 }, threats: [], isOpen: () => false });
        expect(none).toBeNull();
    });
});
