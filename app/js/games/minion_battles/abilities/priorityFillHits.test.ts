import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import {
    priorityFillHits,
    splitSelectOrderTargets,
} from './priorityFillHits';

function makeUnit(
    id: string,
    opts?: { stackSize?: number },
): Unit {
    const u = new Unit({
        id,
        x: 0,
        y: 0,
        hp: 100,
        maxHp: 100,
        speed: 100,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'test',
        name: id,
        radius: DEFAULT_UNIT_RADIUS,
    });
    if (opts?.stackSize != null) {
        u.stackSize = opts.stackSize;
    }
    return u;
}

describe('priorityFillHits', () => {
    it('keeps committed units that are still in shape, in commit order', () => {
        const a = makeUnit('a');
        const b = makeUnit('b');
        const c = makeUnit('c');
        const hits = priorityFillHits(['b', 'a'], [a, b, c], 2);
        expect(hits.map((u) => u.id)).toEqual(['b', 'a']);
    });

    it('drops committed units that left the shape and fills with newcomers', () => {
        const committedLeft = makeUnit('left');
        const stillIn = makeUnit('still');
        const newcomer = makeUnit('new');
        const hits = priorityFillHits(
            [committedLeft.id, stillIn.id],
            [stillIn, newcomer],
            2,
        );
        expect(hits.map((u) => u.id)).toEqual(['still', 'new']);
    });

    it('caps at numTargets after priority fill', () => {
        const a = makeUnit('a');
        const b = makeUnit('b');
        const c = makeUnit('c');
        const hits = priorityFillHits(['a'], [a, b, c], 2);
        expect(hits.map((u) => u.id)).toEqual(['a', 'b']);
    });

    it('uses stack-aware slots when distinct targets are scarce', () => {
        const stack = makeUnit('stack', { stackSize: 3 });
        const other = makeUnit('other');
        const hits = priorityFillHits([], [stack, other], 3);
        expect(hits.map((u) => u.id)).toEqual(['stack', 'other', 'stack']);
    });
});

describe('splitSelectOrderTargets', () => {
    it('splits primary, companion, and trailing aim pixel', () => {
        const targets = [
            { type: 'unit' as const, unitId: 'p0' },
            { type: 'unit' as const, unitId: 'p1' },
            { type: 'unit' as const, unitId: 'c0' },
            { type: 'pixel' as const, position: { x: 10, y: 20 } },
        ];
        const split = splitSelectOrderTargets(targets, 2, [1]);
        expect(split.primaryIds).toEqual(['p0', 'p1']);
        expect(split.companionIds).toEqual([['c0']]);
        expect(split.aimPixel).toEqual({ x: 10, y: 20 });
    });
});
