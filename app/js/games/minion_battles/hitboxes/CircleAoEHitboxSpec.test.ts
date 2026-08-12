import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { circleAoEHitbox } from './CircleAoEHitboxSpec';

const CAST_RANGE = 200;
const AOE_RADIUS = 40;
const NUM_TARGETS = 3;

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy' = 'enemy'): Unit {
    return new Unit({
        id,
        x,
        y,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai',
        characterId: 'test',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
}

describe('CircleAoEHitboxSpec', () => {
    const hitbox = circleAoEHitbox({
        castRange: CAST_RANGE,
        aoeRadius: AOE_RADIUS,
        numTargets: NUM_TARGETS,
    });

    it('exposes cast range as maxRange and numTargets', () => {
        expect(hitbox.maxRange).toBe(CAST_RANGE);
        expect(hitbox.numTargets).toBe(NUM_TARGETS);
        expect(hitbox.aoeRadius).toBe(AOE_RADIUS);
    });

    it('resolveTargets includes a unit inside the AoE at clamped aim', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const inside = makeUnit('inside', 100, 0);
        const outside = makeUnit('outside', 100 + AOE_RADIUS + 20, 0);
        const targets = hitbox.resolveTargets(caster, { x: 100, y: 0 }, [caster, inside, outside]);
        expect(targets.map((u) => u.id)).toEqual(['inside']);
    });

    it('resolveTargets clamps aim to cast range before testing the AoE', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        // Aim far beyond cast range; clamped impact is at (CAST_RANGE, 0).
        const atClamp = makeUnit('atClamp', CAST_RANGE, 0);
        const beyondClampAoe = makeUnit('beyond', CAST_RANGE + AOE_RADIUS + 80, 0);
        const targets = hitbox.resolveTargets(
            caster,
            { x: CAST_RANGE + 500, y: 0 },
            [caster, atClamp, beyondClampAoe],
        );
        expect(targets.map((u) => u.id)).toEqual(['atClamp']);
    });

    it('resolveTargets excludes the caster', () => {
        const caster = makeUnit('caster', 50, 50, 'player');
        const targets = hitbox.resolveTargets(caster, { x: 50, y: 50 }, [caster]);
        expect(targets).toEqual([]);
    });
});
