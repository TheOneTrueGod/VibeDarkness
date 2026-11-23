import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { applyDamageToShields, getTotalShieldHp } from './unitShield';
import { applyDamageToUnitDetailed } from './unitDamage';
import { ShieldBuff } from '../../buffs/ShieldBuff';
import { createGuardShield } from '../../buffs/guardShield';

function makeUnit(overrides: Partial<ConstructorParameters<typeof Unit>[0]> = {}): Unit {
    return new Unit({
        id: 'u1',
        x: 0,
        y: 0,
        hp: 40,
        maxHp: 40,
        speed: 100,
        teamId: 'player',
        ownerId: 'ai',
        characterId: 'target_dummy',
        name: 'Dog',
        ...overrides,
    });
}

describe('applyDamageToShields', () => {
    it('a single shield absorbs a partial hit and reduces only remainingHp, leaving unit.hp untouched', () => {
        const unit = makeUnit();
        const shield = new ShieldBuff(30, 0);
        unit.buffs = [shield];

        const result = applyDamageToShields(unit, 10);

        expect(result).toEqual({ shieldAbsorbed: 10, remainingDamage: 0, absorbingShields: [shield] });
        expect((unit.buffs[0] as ShieldBuff).remainingHp).toBe(20);
        expect(unit.hp).toBe(40);
    });

    it('a hit exceeding shield hp carries the excess through as remainingDamage', () => {
        const unit = makeUnit();
        const shield = new ShieldBuff(10, 0);
        unit.buffs = [shield];

        const result = applyDamageToShields(unit, 15);

        expect(result).toEqual({ shieldAbsorbed: 10, remainingDamage: 5, absorbingShields: [shield] });
        expect((unit.buffs[0] as ShieldBuff).remainingHp).toBe(0);
    });

    it('consumes two stacked shields in array order, only touching the second once the first is depleted', () => {
        const unit = makeUnit();
        const first = new ShieldBuff(10, 0);
        const second = new ShieldBuff(20, 0);
        unit.buffs = [first, second];

        const result = applyDamageToShields(unit, 15);

        expect(result).toEqual({ shieldAbsorbed: 15, remainingDamage: 0, absorbingShields: [first, second] });
        expect(first.remainingHp).toBe(0);
        expect(second.remainingHp).toBe(15);
    });

    it('is a no-op when there are no shield buffs', () => {
        const unit = makeUnit();

        const result = applyDamageToShields(unit, 10);

        expect(result).toEqual({ shieldAbsorbed: 0, remainingDamage: 10, absorbingShields: [] });
    });
});

describe('getTotalShieldHp', () => {
    it('is 0 when there are no shield buffs', () => {
        const unit = makeUnit();
        expect(getTotalShieldHp(unit)).toBe(0);
    });

    it('sums remainingHp across multiple stacked shields', () => {
        const unit = makeUnit();
        unit.buffs = [new ShieldBuff(10, 0), new ShieldBuff(20, 0)];
        expect(getTotalShieldHp(unit)).toBe(30);
    });
});

describe('applyDamageToUnitDetailed shieldAbsorbed', () => {
    it('reports shieldAbsorbed matching what was actually consumed, and lets the rest through to hp', () => {
        const unit = makeUnit({ hp: 40, maxHp: 40 });
        const shield = new ShieldBuff(10, 0);
        unit.buffs = [shield];
        const eventBus = new EventBus();

        const breakdown = applyDamageToUnitDetailed(unit, 15, null, eventBus);

        expect(breakdown).toEqual({ hpDamage: 5, armourRemoved: 0, shieldAbsorbed: 10, absorbingShields: [shield] });
        expect(unit.hp).toBe(35);
    });

    it('reports zero shieldAbsorbed and full hpDamage when there is no shield', () => {
        const unit = makeUnit({ hp: 40, maxHp: 40 });
        const eventBus = new EventBus();

        const breakdown = applyDamageToUnitDetailed(unit, 12, null, eventBus);

        expect(breakdown).toEqual({ hpDamage: 12, armourRemoved: 0, shieldAbsorbed: 0 });
        expect(unit.hp).toBe(28);
    });
});

describe('guard shield (refill floor)', () => {
    const guard = (id = 'spirit') => createGuardShield({ floor: 2, seconds: 10, gameTime: 0, guardianUnitId: id });

    it('a 5-damage hit deals 3 through and leaves the shield at 2', () => {
        const unit = makeUnit();
        const shield = guard();
        unit.buffs = [shield];

        const result = applyDamageToShields(unit, 5);

        expect(result.shieldAbsorbed).toBe(2);
        expect(result.remainingDamage).toBe(3);
        expect(shield.remainingHp).toBe(2);
        expect(shield.isExpired(0, 1)).toBe(false);
    });

    it('two guard shields reduce a 5-damage hit to 1 and both stay at 2', () => {
        const unit = makeUnit();
        const a = guard('a');
        const b = guard('b');
        unit.buffs = [a, b];

        const result = applyDamageToShields(unit, 5);

        expect(result.remainingDamage).toBe(1);
        expect(a.remainingHp).toBe(2);
        expect(b.remainingHp).toBe(2);
        expect(getTotalShieldHp(unit)).toBe(4);
    });

    it('a guard shield plus a 6-HP plain shield: the guard refills, the plain shield is never refilled', () => {
        const unit = makeUnit();
        const g = guard();
        const plain = new ShieldBuff(6, 0);
        unit.buffs = [g, plain];

        const result = applyDamageToShields(unit, 3);

        expect(result.remainingDamage).toBe(0);
        expect(g.remainingHp).toBe(2);
        expect(plain.remainingHp).toBe(5);

        applyDamageToShields(unit, 3);
        expect(g.remainingHp).toBe(2);
        expect(plain.remainingHp).toBe(4);
    });

    it('a hit smaller than the floor leaves the shield at 2 (refilled, not left at 1)', () => {
        const unit = makeUnit();
        const shield = guard();
        unit.buffs = [shield];

        const result = applyDamageToShields(unit, 1);

        expect(result.remainingDamage).toBe(0);
        expect(shield.remainingHp).toBe(2);
    });
});
