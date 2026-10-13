import { describe, expect, it } from 'vitest';
import { Unit } from '../../game/units/Unit';
import {
    buildComboToTagCancelDef,
    castHitAtLeast,
    getCastHitCount,
    recordCastHits,
} from './comboToTagCancel';
import type { ConditionalCancelConditionContext } from '../abilityTimings';

function makeCaster(withCast: boolean): Unit {
    const unit = new Unit({
        id: 'c', x: 0, y: 0, hp: 10, maxHp: 10, speed: 100, teamId: 'player', ownerId: 'p1',
        characterId: 'player', name: 'c', radius: 10,
    });
    if (withCast) unit.activeAbilities = [{ abilityId: 'x', startTime: 0, targets: [] }];
    return unit;
}

function ctx(caster: Unit): ConditionalCancelConditionContext {
    return { caster, engine: {} as never, targets: [], abilityId: 'x' };
}

describe('comboToTagCancel', () => {
    it('counts recorded hits on the cast and gates the condition', () => {
        const caster = makeCaster(true);
        expect(getCastHitCount(caster, 'x')).toBe(0);
        expect(castHitAtLeast(1)(ctx(caster))).toBe(false);
        recordCastHits(caster, 'x', 0);
        expect(castHitAtLeast(1)(ctx(caster))).toBe(false);
        recordCastHits(caster, 'x', 2);
        recordCastHits(caster, 'x', 1);
        expect(getCastHitCount(caster, 'x')).toBe(3);
        expect(castHitAtLeast(3)(ctx(caster))).toBe(true);
        expect(castHitAtLeast(4)(ctx(caster))).toBe(false);
    });

    it('survives a JSON round trip (stored on castPayload) and ignores casts that are not active', () => {
        const caster = makeCaster(true);
        recordCastHits(caster, 'x', 2);
        const copy = JSON.parse(JSON.stringify(caster.activeAbilities[0]!.castPayload));
        expect(copy.castHitCount).toBe(2);
        const idle = makeCaster(false);
        recordCastHits(idle, 'x', 5);
        expect(getCastHitCount(idle, 'x')).toBe(0);
    });

    it('builds a def filtered to the tag', () => {
        const def = buildComboToTagCancelDef({ tag: 'melee', condition: castHitAtLeast(1) });
        expect(def.abilityTagFilter).toEqual(['melee']);
        const caster = makeCaster(true);
        recordCastHits(caster, 'x', 1);
        expect(def.condition(ctx(caster))).toBe(true);
    });
});
