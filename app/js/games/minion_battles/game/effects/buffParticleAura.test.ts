import { describe, expect, it } from 'vitest';
import { BuffRenderEmitterSystem, resolveAuraMotion, TEMPO_ORB_EFFECT_TYPE, TEMPO_SPEED_LINE_EFFECT_TYPE } from './buffParticleAura';
import { TimeDilationBuff, TIME_DILATION_PRESETS } from '../../buffs/TimeDilationBuff';
import type { Effect } from './Effect';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';

function fakeUnit(over: Partial<Record<string, unknown>> = {}): Unit {
    return {
        id: 'u1',
        x: 100,
        y: 100,
        radius: 20,
        active: true,
        movement: null,
        buffs: [TimeDilationBuff.fromPreset(TIME_DILATION_PRESETS.focalHaste2x, 'src')],
        isAlive: () => true,
        ...over,
    } as unknown as Unit;
}

function run(system: BuffRenderEmitterSystem, unit: Unit, frames: number, move?: (u: Unit) => void): Effect[] {
    const out: Effect[] = [];
    for (let i = 0; i < frames; i++) {
        move?.(unit);
        system.update([unit], 1 / 60, (fx) => out.push(fx));
    }
    return out;
}

describe('resolveAuraMotion', () => {
    it('is idle with no displacement and no path', () => {
        expect(resolveAuraMotion(fakeUnit(), { x: 100, y: 100 }).moving).toBe(false);
    });

    it('uses displacement since the last frame', () => {
        const m = resolveAuraMotion(fakeUnit({ x: 103 }), { x: 100, y: 100 });
        expect(m.moving).toBe(true);
        expect(m.dirX).toBeCloseTo(1);
    });

    it('reads a queued path as moving while stationary (paused)', () => {
        const unit = fakeUnit({
            x: CELL_SIZE * 2 + CELL_SIZE / 2,
            y: CELL_SIZE / 2,
            movement: { path: [{ col: 2, row: 0 }, { col: 2, row: 1 }], targetUnitId: undefined, pathfindingTick: 0 },
        });
        const m = resolveAuraMotion(unit, { x: unit.x, y: unit.y });
        expect(m.moving).toBe(true);
        expect(m.dirY).toBeCloseTo(1);
    });
});

describe('BuffRenderEmitterSystem', () => {
    it('emits orbs just inside the radius while idle', () => {
        const unit = fakeUnit();
        const fx = run(new BuffRenderEmitterSystem(), unit, 60);
        expect(fx.length).toBeGreaterThan(5);
        expect(fx.every((e) => e.effectType === TEMPO_ORB_EFFECT_TYPE)).toBe(true);
        for (const e of fx) {
            const d = Math.hypot(e.x - unit.x, e.y - unit.y);
            expect(d).toBeLessThan(unit.radius);
            expect(d).toBeGreaterThan(unit.radius * 0.5);
        }
    });

    it('emits speed lines behind the unit while moving, drifting backward', () => {
        const unit = fakeUnit();
        const system = new BuffRenderEmitterSystem();
        const lines: { fx: Effect; unitX: number }[] = [];
        for (let i = 0; i < 60; i++) {
            (unit as { x: number }).x += 2;
            system.update([unit], 1 / 60, (fx) => lines.push({ fx, unitX: unit.x }));
        }
        expect(lines.length).toBeGreaterThan(10);
        for (const { fx, unitX } of lines) {
            expect(fx.effectType).toBe(TEMPO_SPEED_LINE_EFFECT_TYPE);
            expect((fx.effectData as { dirX: number }).dirX).toBeCloseTo(1);
            const startX = fx.x;
            expect(startX).toBeLessThan(unitX);
            fx.renderUpdate(fx.duration * 0.99);
            expect(fx.x).toBeLessThan(startX);
        }
    });

    it('emits nothing for units without an aura buff', () => {
        const fx = run(new BuffRenderEmitterSystem(), fakeUnit({ buffs: [] }), 60);
        expect(fx).toHaveLength(0);
    });
});
