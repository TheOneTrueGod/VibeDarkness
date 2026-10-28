import { describe, it, expect } from 'vitest';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { applyBleedStack, consumeBleedStacks, isBleeding, tickBleedForRoundMilestone } from './bleedRuntime';
import { BleedBuff, BLEED_STACKS_PER_DAMAGE } from './BleedBuff';

function makeUnit(hp = 100): Unit {
    return new Unit({
        id: 'u_bleed',
        x: 0,
        y: 0,
        hp,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'e1',
        characterId: 'player',
        portraitId: 'warrior',
        name: 'BleedTarget',
    });
}

describe('bleedRuntime', () => {
    it('merges bleed stacks onto one buff', () => {
        const u = makeUnit();
        applyBleedStack(u, 0, 1);
        applyBleedStack(u, 0.1, 1);
        expect(u.buffs.length).toBe(1);
        const b = u.buffs[0];
        expect(b).toBeInstanceOf(BleedBuff);
        expect((b as BleedBuff).stacks).toBe(2);
    });

    it('tick deals ceil(stacks/10) damage and removes that many stacks', () => {
        const bus = new EventBus();
        const u = makeUnit(100);
        const stacks = BLEED_STACKS_PER_DAMAGE * 2 + 3;
        applyBleedStack(u, 0, 1, stacks);

        tickBleedForRoundMilestone([u], bus);

        const damage = Math.ceil(stacks / BLEED_STACKS_PER_DAMAGE);
        expect(u.hp).toBe(100 - damage);
        const bleed = u.buffs.find((b): b is BleedBuff => b instanceof BleedBuff);
        expect(bleed?.stacks).toBe(stacks - damage);
    });

    it('clears bleed buff when stacks reach zero after tick', () => {
        const bus = new EventBus();
        const u = makeUnit(1000);
        applyBleedStack(u, 0, 1);

        tickBleedForRoundMilestone([u], bus);

        // ceil(1/10) = 1 damage
        expect(u.hp).toBe(999);
        const expired = u.buffs[0]?.isExpired(99, 99) ?? false;
        expect(expired).toBe(true);
    });

    it('consumeBleedStacks removes exactly max stacks when more are present', () => {
        const u = makeUnit();
        applyBleedStack(u, 0, 1, 6);

        expect(consumeBleedStacks(u, 4)).toBe(4);
        expect(u.buffs.find((b): b is BleedBuff => b instanceof BleedBuff)?.stacks).toBe(2);
        expect(isBleeding(u)).toBe(true);
    });

    it('consumeBleedStacks removes every stack when fewer than max remain', () => {
        const u = makeUnit();
        applyBleedStack(u, 0, 1, 2);

        expect(consumeBleedStacks(u, 4)).toBe(2);
        expect(isBleeding(u)).toBe(false);
    });

    it('consumeBleedStacks returns 0 for a non-bleeding unit', () => {
        const u = makeUnit();
        expect(consumeBleedStacks(u, 4)).toBe(0);
        expect(isBleeding(u)).toBe(false);
    });
});
