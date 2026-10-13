import { describe, expect, it, vi } from 'vitest';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { UnitTag } from '../game/units/unitTag';
import { StaggeredBuff, STAGGERED_BUFF_TYPE } from '../buffs/StaggeredBuff';
import { StunnedBuff } from '../buffs/StunnedBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import { buffFromJSON } from '../buffs/buffRegistry';
import { tryApplyStagger } from './tryApplyStagger';
import type { KnockbackEngineCtx } from './knockbackKeywords';

function makeUnit(): Unit {
    return new Unit({
        id: 'u',
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 50,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'enemy_melee',
        name: 'Dummy',
    });
}

function makeCtx(overrides: Partial<KnockbackEngineCtx> = {}): KnockbackEngineCtx {
    return { gameTime: 1, roundNumber: 1, eventBus: new EventBus(), ...overrides };
}

function armour(u: Unit, floor = 2): void {
    u.ccArmour.hardFloor = floor;
    u.ccArmour.bonusHard = 0;
    u.ccArmour.chainResist = 0;
}

function staggerBuffs(u: Unit): StaggeredBuff[] {
    return u.buffs.filter((b) => b._type === STAGGERED_BUFF_TYPE) as StaggeredBuff[];
}

describe('tryApplyStagger', () => {
    it('staggers an unarmoured unit, which then cannot act, and interrupts its abilities', () => {
        const u = makeUnit();
        expect(u.canAct()).toBe(true);
        const interrupt = vi.fn();
        const r = tryApplyStagger(u, 0.6, makeCtx({ interruptUnitAndRefundAbilities: interrupt }));
        expect(r).toEqual({ outcome: 'applied', effectiveDuration: 0.6 });
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(true);
        expect(u.hasActingBlockingBuff()).toBe(true);
        expect(u.canAct()).toBe(false);
        expect(interrupt).toHaveBeenCalledWith(u);
    });

    it('does not count toward hard-CC chain stacking', () => {
        const u = makeUnit();
        u.ccArmour.chainResist = 2;
        tryApplyStagger(u, 0.6, makeCtx());
        expect(u.ccArmour.bonusHard).toBe(0);
    });

    it('is absorbed by armour without consuming it or applying Exposed', () => {
        const u = makeUnit();
        armour(u, 2);
        u.ccArmour.hardConsumed = 1;
        const r = tryApplyStagger(u, 0.6, makeCtx());
        expect(r.outcome).toBe('absorbed');
        expect(u.ccArmour.hardConsumed).toBe(1);
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(u.hasBuff(EXPOSED_BUFF_TYPE)).toBe(false);
        expect(u.canAct()).toBe(true);
    });

    it('never breaks armour even when it is one charge from breaking', () => {
        const u = makeUnit();
        armour(u, 1);
        u.ccArmour.hardConsumed = 1;
        expect(tryApplyStagger(u, 0.6, makeCtx()).outcome).toBe('absorbed');
        expect(u.ccArmour.hardConsumed).toBe(1);
        expect(u.hasBuff(EXPOSED_BUFF_TYPE)).toBe(false);
    });

    it('on an Exposed target extends Exposed, emits the suppressed event and adds no Staggered buff', () => {
        const u = makeUnit();
        armour(u, 2);
        const exposed = new ExposedBuff(3);
        u.addBuff(exposed, 0, 1);
        const extend = vi.spyOn(exposed, 'extendDuration');
        const eventBus = new EventBus();
        const emit = vi.spyOn(eventBus, 'emit');

        const r = tryApplyStagger(u, 0.6, makeCtx({ eventBus }));
        expect(r.outcome).toBe('absorbed');
        expect(extend).toHaveBeenCalledWith(0.6, 1);
        expect(emit).toHaveBeenCalledWith('boss_exposed_cc_suppressed', { unitId: 'u' });
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
    });

    it('is absorbed during iFrames unless respectIFrames is false', () => {
        const u = makeUnit();
        vi.spyOn(u, 'hasIFrames').mockReturnValue(true);
        expect(tryApplyStagger(u, 0.6, makeCtx()).outcome).toBe('absorbed');
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(tryApplyStagger(u, 0.6, makeCtx({ respectIFrames: false })).outcome).toBe('applied');
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(true);
    });

    it('is absorbed during the juggernaut window', () => {
        const u = makeUnit();
        vi.spyOn(u, 'isInJuggernautWindow').mockReturnValue(true);
        const interrupt = vi.fn();
        expect(tryApplyStagger(u, 0.6, makeCtx({ interruptUnitAndRefundAbilities: interrupt })).outcome).toBe(
            'absorbed',
        );
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
        expect(interrupt).not.toHaveBeenCalled();
    });

    it('refreshes to a longer duration but never extends or shortens an existing Stagger', () => {
        const u = makeUnit();
        tryApplyStagger(u, 1, makeCtx({ gameTime: 0 }));
        // Shorter hit while 1s remains: unchanged.
        expect(tryApplyStagger(u, 0.5, makeCtx({ gameTime: 0.2 })).outcome).toBe('absorbed');
        expect(staggerBuffs(u)).toHaveLength(1);
        expect(staggerBuffs(u)[0].duration.value).toBe(1);
        expect(staggerBuffs(u)[0].appliedAtTime).toBe(0);
        // Longer hit: replaced, not stacked.
        expect(tryApplyStagger(u, 2, makeCtx({ gameTime: 0.2 })).outcome).toBe('applied');
        expect(staggerBuffs(u)).toHaveLength(1);
        expect(staggerBuffs(u)[0].duration.value).toBe(2);
        expect(staggerBuffs(u)[0].appliedAtTime).toBe(0.2);
    });

    it('is a no-op on already stunned or lifted targets', () => {
        const stunned = makeUnit();
        stunned.addBuff(new StunnedBuff(2), 0, 1);
        expect(tryApplyStagger(stunned, 0.6, makeCtx()).outcome).toBe('absorbed');
        expect(stunned.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);

        const lifted = makeUnit();
        lifted.buffs.push(Object.assign(new StunnedBuff(2), { _type: 'lifted' }) as never);
        expect(tryApplyStagger(lifted, 0.6, makeCtx()).outcome).toBe('absorbed');
        expect(lifted.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
    });

    it('Structure units fully resist', () => {
        const u = makeUnit();
        u.tags = [UnitTag.Structure];
        expect(tryApplyStagger(u, 0.6, makeCtx()).outcome).toBe('absorbed');
        expect(u.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
    });

    it('applies duration resist and ignores sub-potency results', () => {
        const u = makeUnit();
        u.ccArmour.durationResistPct = { STAGGER: 0.5 };
        const r = tryApplyStagger(u, 1, makeCtx());
        expect(r).toEqual({ outcome: 'applied', effectiveDuration: 0.5 });

        const v = makeUnit();
        v.ccArmour.durationResistPct = { ALL: 0.95 };
        expect(tryApplyStagger(v, 1, makeCtx()).outcome).toBe('no_potency');
        expect(v.hasBuff(STAGGERED_BUFF_TYPE)).toBe(false);
    });

    it('expires and round-trips through the buff registry', () => {
        const u = makeUnit();
        tryApplyStagger(u, 0.6, makeCtx({ gameTime: 1 }));
        const buff = staggerBuffs(u)[0];
        expect(buff.isExpired(1.5, 1)).toBe(false);
        expect(buff.isExpired(1.6, 1)).toBe(true);
        const copy = buffFromJSON(buff.toJSON());
        expect(copy._type).toBe(STAGGERED_BUFF_TYPE);
        expect(copy.blocksActing).toBe(true);
    });
});
