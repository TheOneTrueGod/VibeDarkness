import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { UNIT_RANGE_PICK_CURSOR_EXTRA, unitRangeHitbox } from './UnitRangeHitboxSpec';

const MAX_RANGE = 160;

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

describe('UnitRangeHitboxSpec', () => {
    const hitbox = unitRangeHitbox(MAX_RANGE);

    it('resolveTargets returns unit under aim when in range', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const enemy = makeUnit('enemy', 100, 0);
        const targets = hitbox.resolveTargets(caster, { x: 100, y: 0 }, [caster, enemy]);
        expect(targets).toEqual([enemy]);
    });

    it('resolveTargets snaps to a unit within cursor extra + radius of aim', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const enemy = makeUnit('enemy', 100, 0);
        const aimOffset = DEFAULT_UNIT_RADIUS + UNIT_RANGE_PICK_CURSOR_EXTRA - 5;
        const targets = hitbox.resolveTargets(
            caster,
            { x: 100 + aimOffset, y: 0 },
            [caster, enemy],
        );
        expect(targets).toEqual([enemy]);
    });

    it('resolveTargets returns empty when aim is outside cursor snap radius', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const enemy = makeUnit('enemy', 100, 0);
        const aimOffset = DEFAULT_UNIT_RADIUS + UNIT_RANGE_PICK_CURSOR_EXTRA + 5;
        const targets = hitbox.resolveTargets(
            caster,
            { x: 100 + aimOffset, y: 0 },
            [caster, enemy],
        );
        expect(targets).toEqual([]);
    });

    it('resolveTargets picks the closest unit when several are in snap range', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const near = makeUnit('near', 100, 0);
        const far = makeUnit('far', 120, 0);
        const targets = hitbox.resolveTargets(caster, { x: 105, y: 0 }, [caster, near, far]);
        expect(targets).toEqual([near]);
    });

    it('resolveTargets returns empty when enemy is out of caster range', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const enemy = makeUnit('enemy', MAX_RANGE + 50, 0);
        const targets = hitbox.resolveTargets(caster, { x: enemy.x, y: enemy.y }, [caster, enemy]);
        expect(targets).toEqual([]);
    });

    it('resolveTargets excludes caster', () => {
        const caster = makeUnit('caster', 50, 50, 'player');
        const targets = hitbox.resolveTargets(caster, { x: 50, y: 50 }, [caster]);
        expect(targets).toEqual([]);
    });

    it('resolveTargets includes caster when includeCaster is set', () => {
        const selfTargetable = unitRangeHitbox(MAX_RANGE, 0, true);
        const caster = makeUnit('caster', 50, 50, 'player');
        const targets = selfTargetable.resolveTargets(caster, { x: 50, y: 50 }, [caster]);
        expect(targets).toEqual([caster]);
    });

    it('minRange rejects targets closer than the floor', () => {
        const ranged = unitRangeHitbox(MAX_RANGE, 40);
        const caster = makeUnit('caster', 0, 0, 'player');
        const enemy = makeUnit('enemy', 20, 0);
        const targets = ranged.resolveTargets(caster, { x: 20, y: 0 }, [caster, enemy]);
        expect(targets).toEqual([]);
    });
});
