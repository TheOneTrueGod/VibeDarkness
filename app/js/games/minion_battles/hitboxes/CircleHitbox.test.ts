import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';
import { CircleHitbox, unitOverlapsCircle } from './CircleHitbox';
import type { HitboxEngineContext } from './Hitbox';

const AOE_RADIUS = 40;
const OVERLAP_PAST_EDGE = 5;

function makeUnit(
    id: string,
    x: number,
    y: number,
    teamId: 'player' | 'enemy' = 'enemy',
    radius: number = DEFAULT_UNIT_RADIUS,
): Unit {
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
        radius,
    });
}

function makeEngine(units: Unit[]): HitboxEngineContext {
    return {
        units,
        gameTime: 0,
        getUnit: (id) => units.find((u) => u.id === id),
    };
}

describe('unitOverlapsCircle', () => {
    it('is true when the unit center is inside the disk', () => {
        const unit = makeUnit('inside', AOE_RADIUS, 0);
        expect(unitOverlapsCircle(unit, 0, 0, AOE_RADIUS)).toBe(true);
    });

    it('is true when the unit body overlaps the disk even if the center is outside', () => {
        const unit = makeUnit('overlap', AOE_RADIUS + OVERLAP_PAST_EDGE, 0);
        expect(unitOverlapsCircle(unit, 0, 0, AOE_RADIUS)).toBe(true);
    });

    it('is false when the unit body is fully outside the disk', () => {
        const unit = makeUnit('outside', AOE_RADIUS + DEFAULT_UNIT_RADIUS + OVERLAP_PAST_EDGE, 0);
        expect(unitOverlapsCircle(unit, 0, 0, AOE_RADIUS)).toBe(false);
    });

    it('uses the unit radius so larger units overlap from farther away', () => {
        const largeRadius = DEFAULT_UNIT_RADIUS * 2;
        const large = makeUnit('large', AOE_RADIUS + DEFAULT_UNIT_RADIUS + OVERLAP_PAST_EDGE, 0, 'enemy', largeRadius);
        const small = makeUnit('small', AOE_RADIUS + DEFAULT_UNIT_RADIUS + OVERLAP_PAST_EDGE, 0);
        expect(unitOverlapsCircle(large, 0, 0, AOE_RADIUS)).toBe(true);
        expect(unitOverlapsCircle(small, 0, 0, AOE_RADIUS)).toBe(false);
    });
});

describe('CircleHitbox.getUnitsInHitbox', () => {
    it('includes an enemy whose body overlaps the disk', () => {
        const caster = makeUnit('caster', 0, 0, 'player');
        const overlapping = makeUnit('overlap', AOE_RADIUS + OVERLAP_PAST_EDGE, 0);
        const fullyOutside = makeUnit('outside', AOE_RADIUS + DEFAULT_UNIT_RADIUS + OVERLAP_PAST_EDGE, 0);
        const hits = CircleHitbox.getUnitsInHitbox(
            makeEngine([caster, overlapping, fullyOutside]),
            caster,
            0,
            0,
            AOE_RADIUS,
        );
        expect(hits.map((u) => u.id)).toEqual(['overlap']);
    });
});
