import { describe, it, expect } from 'vitest';
import { Unit } from '../game/units/Unit';
import { EventBus } from '../game/EventBus';
import { applyBleedStack, tickBleedForRoundMilestone } from './bleedRuntime';
import { BleedBuff } from './BleedBuff';

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

    it('tick deals ceil(stacks/10) damage then removes one stack', () => {
        const bus = new EventBus();
        const u = makeUnit(100);
        applyBleedStack(u, 0, 1, 3);

        tickBleedForRoundMilestone([u], bus);

        // ceil(3/10) = 1 damage
        expect(u.hp).toBe(99);
        const bleed = u.buffs.find((b): b is BleedBuff => b instanceof BleedBuff);
        expect(bleed?.stacks).toBe(2);
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
});
