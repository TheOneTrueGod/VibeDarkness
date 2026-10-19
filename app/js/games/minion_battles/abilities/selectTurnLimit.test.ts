import { describe, expect, it } from 'vitest';
import { constrainSelectAim } from './targeting';
import type { SelectTargetDef } from './timingTargetDef';
import { nullHitbox } from '../hitboxes';
import type { ResolvedTarget } from '../game/types';

const caster = { x: 0, y: 0 };
const engine = { getUnit: () => undefined };
const def: SelectTargetDef = {
    kind: 'select',
    label: 'Second',
    hitbox: nullHitbox,
    filter: 'enemy',
    turnLimit: { fromLabel: 'First', maxDegrees: 30 },
};
const upward: Record<string, ResolvedTarget> = { First: { type: 'pixel', position: { x: 0, y: -100 } } };

describe('constrainSelectAim (turnLimit)', () => {
    it('leaves an aim inside the arc unchanged', () => {
        const aim = { x: 20, y: -100 };
        expect(constrainSelectAim(caster, def, aim, upward, engine)).toEqual(aim);
    });

    it('clamps an aim past the arc to the arc edge, keeping its distance', () => {
        const out = constrainSelectAim(caster, def, { x: 50, y: 0 }, upward, engine);
        expect(out.x).toBeCloseTo(50 * Math.sin(Math.PI / 6));
        expect(out.y).toBeCloseTo(-50 * Math.cos(Math.PI / 6));
    });

    it('clamps to the nearer edge on the other side too', () => {
        const out = constrainSelectAim(caster, def, { x: -10, y: 100 }, upward, engine);
        expect(Math.atan2(out.y, out.x)).toBeCloseTo(-Math.PI / 2 - Math.PI / 6);
    });

    it('does nothing without a turn limit or before the earlier pick exists', () => {
        const aim = { x: 50, y: 0 };
        expect(constrainSelectAim(caster, { ...def, turnLimit: undefined }, aim, upward, engine)).toEqual(aim);
        expect(constrainSelectAim(caster, def, aim, {}, engine)).toEqual(aim);
    });
});
