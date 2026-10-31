import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { ringHitbox, unitOverlapsRing } from './RingHitbox';

const INNER = DEFAULT_UNIT_RADIUS + 4;
const OUTER = DEFAULT_UNIT_RADIUS * 2;
const NUM_TARGETS = 5;

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

describe('RingHitboxSpec', () => {
    const hitbox = ringHitbox({
        innerRadius: INNER,
        outerRadius: OUTER,
        numTargets: NUM_TARGETS,
    });

    it('exposes the outer radius as maxRange', () => {
        expect(hitbox.maxRange).toBe(OUTER);
        expect(hitbox.numTargets).toBe(NUM_TARGETS);
    });

    it('includes a unit in the band and excludes the hole, the outside, and the caster', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const inBand = makeUnit('band', (INNER + OUTER) / 2, 0);
        const inHole = makeUnit('hole', 1, 0);
        const outside = makeUnit('out', OUTER + DEFAULT_UNIT_RADIUS + 5, 0);
        expect(unitOverlapsRing(inHole, 0, 0, INNER, OUTER)).toBe(false);
        const targets = hitbox.resolveTargets(caster, { x: 400, y: 0 }, [caster, inBand, inHole, outside]);
        expect(targets.map((u) => u.id)).toEqual(['band']);
    });

    it('includes a unit whose body overlaps the outer edge', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const overlapOffset = 5;
        const overlapping = makeUnit('overlap', OUTER + overlapOffset, 0);
        const fullyOutside = makeUnit('outside', OUTER + DEFAULT_UNIT_RADIUS + overlapOffset, 0);
        const targets = hitbox.resolveTargets(caster, { x: 0, y: 0 }, [caster, overlapping, fullyOutside]);
        expect(targets.map((u) => u.id)).toEqual(['overlap']);
    });

    it('resolveHits uses the caster as the center even when the aim is elsewhere', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const nearCaster = makeUnit('near', (INNER + OUTER) / 2, 0);
        const nearAim = makeUnit('aim', 300, 0);
        const units = [caster, nearCaster, nearAim];
        const hits = hitbox.resolveHits(
            {
                units,
                getUnit: (id) => units.find((u) => u.id === id),
                gameTime: 0,
            },
            caster,
            300,
            0,
        );
        expect(hits.map((u) => u.id)).toEqual(['near']);
    });
});
