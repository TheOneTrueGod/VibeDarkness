import { describe, expect, it, vi } from 'vitest';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { UnitTag } from '../game/units/unitTag';
import { EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import { STAGGERED_BUFF_TYPE } from '../buffs/StaggeredBuff';
import { tryApplyHardCcStun } from './tryApplyHardCcStun';
import { tryApplyStagger } from './tryApplyStagger';
import { tryApplyLift } from './tryApplyLift';
import { tryApplyKnockbackByTier, type KnockbackEngineCtx } from './knockbackKeywords';
import { canCcInterrupt, tryCcInterruptAbilities } from './ccInterrupt';

function makeUnit(tags: UnitTag[] = []): Unit {
    const u = new Unit({
        id: 'boss',
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 50,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'target_dummy',
        name: 'Boss',
    });
    u.tags = tags;
    return u;
}

function ctx(): KnockbackEngineCtx {
    return { gameTime: 1, roundNumber: 1, eventBus: new EventBus() };
}

const SOURCE = { unitId: 'caster', abilityId: 'test' };

describe('UnitTag.CcImmune', () => {
    it('ignores stun without spending armour or gaining Exposed', () => {
        const u = makeUnit([UnitTag.CcImmune]);
        u.ccArmour.hardFloor = 1;
        const r = tryApplyHardCcStun(u, 2, 1, 1);
        // A second attempt would break armour on a normal unit.
        tryApplyHardCcStun(u, 2, 1, 1);
        expect(r.outcome).toBe('absorbed');
        expect(u.ccArmour.hardConsumed).toBe(0);
        expect(u.hasBuff(EXPOSED_BUFF_TYPE)).toBe(false);
        expect(u.canAct()).toBe(true);
    });

    it('ignores stagger', () => {
        const u = makeUnit([UnitTag.CcImmune]);
        const r = tryApplyStagger(u, 0.6, ctx());
        expect(r.outcome).toBe('absorbed');
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
    });

    it('does not move on knockback and spends no armour', () => {
        const u = makeUnit([UnitTag.CcImmune]);
        u.ccArmour.hardFloor = 1;
        const interrupt = vi.fn();
        const r = tryApplyKnockbackByTier(u, 3, SOURCE, 0, 0, { ...ctx(), interruptUnitAndRefundAbilities: interrupt });
        expect(r.outcome).toBe('fully_resisted');
        expect(u.knockback).toBeNull();
        expect(u.ccArmour.hardConsumed).toBe(0);
        expect(interrupt).not.toHaveBeenCalled();
    });

    it('is not lifted', () => {
        const u = makeUnit([UnitTag.CcImmune]);
        const r = tryApplyLift(u, 1, { slamDamage: 5, sourceAbilityId: 'x' }, SOURCE, ctx());
        expect(r.outcome).toBe('absorbed');
        expect(u.buffs.length).toBe(0);
    });

    it('cannot be CC-interrupted', () => {
        const u = makeUnit([UnitTag.CcImmune]);
        expect(canCcInterrupt(u, 1)).toBe(false);
        const interrupt = vi.spyOn(u, 'interruptAllAbilities');
        expect(tryCcInterruptAbilities(u, { gameTime: 1 } as never)).toBe(false);
        expect(interrupt).not.toHaveBeenCalled();
    });

    it('leaves a unit without the tag unchanged', () => {
        const u = makeUnit();
        expect(tryApplyHardCcStun(u, 2, 1, 1).outcome).toBe('applied');
        expect(canCcInterrupt(makeUnit(), 1)).toBe(true);
        const k = makeUnit();
        expect(tryApplyKnockbackByTier(k, 3, SOURCE, 0, 0, ctx()).outcome).toBe('applied');
        expect(k.knockback).not.toBeNull();
        const l = makeUnit();
        expect(tryApplyLift(l, 1, { slamDamage: 5, sourceAbilityId: 'x' }, SOURCE, ctx()).outcome).toBe('applied');
    });
});
