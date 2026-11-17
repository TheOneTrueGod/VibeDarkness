import { describe, expect, it } from 'vitest';
import { EventBus, type DamageTakenEvent } from './EventBus';
import { Unit } from './units/Unit';
import type { TeamId } from './teams';
import {
    applyFlatReductionToHit,
    registerFlatReductionCondition,
} from './units/flatDamageReduction';
import { serializeUnit } from './units/unitToJSON';
import { applySerializedUnitState } from './units/unitFromJSON';
import { ShieldBuff } from '../buffs/ShieldBuff';
import { ExposedBuff } from '../buffs/ExposedBuff';

function makeUnit(id = 'u', hp = 1000): Unit {
    return new Unit({
        id,
        x: 0,
        y: 0,
        hp,
        maxHp: hp,
        speed: 100,
        teamId: 'enemy' as TeamId,
        ownerId: 'p1',
        characterId: 'player',
        name: id,
    });
}

let shellOn = true;
registerFlatReductionCondition('test_shell_on', () => shellOn);

function hit(unit: Unit, amount: number): { hpLost: number; event: DamageTakenEvent | undefined } {
    const eventBus = new EventBus();
    let event: DamageTakenEvent | undefined;
    eventBus.on('damage_taken', (e: DamageTakenEvent) => {
        event = e;
    });
    const before = unit.hp;
    unit.takeDamage(amount, 'attacker', eventBus);
    return { hpLost: before - unit.hp, event };
}

describe('flat per-hit damage reduction', () => {
    it('pure formula: 25 -> 15, 14 -> 10, 6 -> 6 with amount 10 / floor 10', () => {
        const r = { amount: 10, floor: 10 };
        expect(applyFlatReductionToHit(25, r)).toBe(15);
        expect(applyFlatReductionToHit(14, r)).toBe(10);
        expect(applyFlatReductionToHit(6, r)).toBe(6);
    });

    it('applies through takeDamage and reports the resisted amount on damage_taken', () => {
        shellOn = true;
        const unit = makeUnit();
        unit.flatDamageReductions = [{ amount: 10, floor: 10, condition: 'test_shell_on' }];
        const a = hit(unit, 25);
        expect(a.hpLost).toBe(15);
        expect(a.event?.resisted).toBe(10);
        const b = hit(unit, 14);
        expect(b.hpLost).toBe(10);
        expect(b.event?.resisted).toBe(4);
        const c = hit(unit, 6);
        expect(c.hpLost).toBe(6);
        expect(c.event?.resisted).toBeUndefined();
    });

    it('does nothing while the condition is false (full damage, no resisted)', () => {
        shellOn = false;
        const unit = makeUnit();
        unit.flatDamageReductions = [{ amount: 10, floor: 10, condition: 'test_shell_on' }];
        const a = hit(unit, 25);
        expect(a.hpLost).toBe(25);
        expect(a.event?.resisted).toBeUndefined();
        shellOn = true;
    });

    it('an unregistered condition id is inactive', () => {
        const unit = makeUnit();
        unit.flatDamageReductions = [{ amount: 10, floor: 10, condition: 'no_such_condition' }];
        expect(hit(unit, 25).hpLost).toBe(25);
    });

    it('stacks after the target percentage modifier (exposed x1.2) and before shields', () => {
        const unit = makeUnit();
        unit.flatDamageReductions = [{ amount: 10, floor: 10 }];
        // Without a reduction: 20 * 1.2 = 24. With: 24 - 10 = 14 (reduction sees the post-percentage hit).
        unit.addBuff(new ShieldBuff(5, 0), 0, 1);
        unit.addBuff(new ExposedBuff(30), 0, 1);
        const r = hit(unit, 20);
        // 14 reaches the shield; shield (5) absorbs 5, 9 hp lost.
        expect(r.event?.resisted).toBe(10);
        expect(r.hpLost).toBe(9);
    });

    it('serializes and restores reductions', () => {
        const unit = makeUnit();
        unit.flatDamageReductions = [{ amount: 10, floor: 10, condition: 'test_shell_on' }];
        const json = JSON.parse(JSON.stringify(serializeUnit(unit, 0)));
        const restored = makeUnit();
        applySerializedUnitState(restored, json, new EventBus(), 0);
        expect(restored.flatDamageReductions).toEqual([{ amount: 10, floor: 10, condition: 'test_shell_on' }]);
        expect(serializeUnit(makeUnit(), 0)).not.toHaveProperty('flatDamageReductions');
    });
});
