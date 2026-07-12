import { describe, it, expect } from 'vitest';
import { Unit } from './Unit';
import { EventBus } from '../EventBus';
import { applyDamageToShields } from './unitShield';
import { applyDamageToUnitDetailed } from './unitDamage';
import { ShieldBuff } from '../../buffs/ShieldBuff';

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
        characterId: 'dog',
        name: 'Dog',
        ...overrides,
    });
}

describe('applyDamageToShields', () => {
    it('a single shield absorbs a partial hit and reduces only remainingHp, leaving unit.hp untouched', () => {
        const unit = makeUnit();
        unit.buffs = [new ShieldBuff(30, 7)];

        const result = applyDamageToShields(unit, 10);

        expect(result).toEqual({ shieldAbsorbed: 10, remainingDamage: 0 });
        expect((unit.buffs[0] as ShieldBuff).remainingHp).toBe(20);
        expect(unit.hp).toBe(40);
    });

    it('a hit exceeding shield hp carries the excess through as remainingDamage', () => {
        const unit = makeUnit();
        unit.buffs = [new ShieldBuff(10, 7)];

        const result = applyDamageToShields(unit, 15);

        expect(result).toEqual({ shieldAbsorbed: 10, remainingDamage: 5 });
        expect((unit.buffs[0] as ShieldBuff).remainingHp).toBe(0);
    });

    it('consumes two stacked shields in array order, only touching the second once the first is depleted', () => {
        const unit = makeUnit();
        const first = new ShieldBuff(10, 7);
        const second = new ShieldBuff(20, 7);
        unit.buffs = [first, second];

        const result = applyDamageToShields(unit, 15);

        expect(result).toEqual({ shieldAbsorbed: 15, remainingDamage: 0 });
        expect(first.remainingHp).toBe(0);
        expect(second.remainingHp).toBe(15);
    });

    it('is a no-op when there are no shield buffs', () => {
        const unit = makeUnit();

        const result = applyDamageToShields(unit, 10);

        expect(result).toEqual({ shieldAbsorbed: 0, remainingDamage: 10 });
    });
});

describe('applyDamageToUnitDetailed shieldAbsorbed', () => {
    it('reports shieldAbsorbed matching what was actually consumed, and lets the rest through to hp', () => {
        const unit = makeUnit({ hp: 40, maxHp: 40 });
        unit.buffs = [new ShieldBuff(10, 7)];
        const eventBus = new EventBus();

        const breakdown = applyDamageToUnitDetailed(unit, 15, null, eventBus);

        expect(breakdown).toEqual({ hpDamage: 5, armourRemoved: 0, shieldAbsorbed: 10 });
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
