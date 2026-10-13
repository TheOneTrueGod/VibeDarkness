import { describe, expect, it, vi } from 'vitest';
import {
    computeAimedKnockbackParams,
    getKnockbackTierDef,
    KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR,
    resolveHitKnockbackDirection,
    tryApplyKnockbackByTier,
    type KnockbackDirectionStrategy,
    type KnockbackEngineCtx,
} from './knockbackKeywords';
import {
    FORCE_PUSH_LANDING_DISTANCE_SCALE,
    FORCE_PUSH_LANDING_MAX_DISTANCE,
    FORCE_PUSH_LANDING_MIN_DISTANCE,
} from '../card_defs/09_gravity_core/gravityConstants';
import { Unit } from '../game/units/Unit';
import type { KnockbackSource } from '../game/units/unitTypes';
import { EventBus } from '../game/EventBus';
import { UnitTag } from '../game/units/unitTag';

const TIER_3 = getKnockbackTierDef(3)!;
const IFRAME_KNOCKBACK_TIER = 3;

describe('resolveHitKnockbackDirection', () => {
    const TRAVEL_RIGHT = { x: 1, y: 0 };
    const ORIGIN = { x: 0, y: 0 };
    const SIDE_45: KnockbackDirectionStrategy = { kind: 'sideOfTravel', angleDeg: 45 };
    const HALF_ROOT_2 = Math.SQRT1_2;

    it('travel returns the direction of travel unchanged, whatever the victim position', () => {
        const dir = resolveHitKnockbackDirection({ kind: 'travel' }, TRAVEL_RIGHT, ORIGIN, { x: 0, y: 5 });
        expect(dir.x).toBeCloseTo(1, 10);
        expect(dir.y).toBeCloseTo(0, 10);
    });

    it('sideOfTravel pushes toward the victim side (+perpendicular, which is the projectile left)', () => {
        // Travelling right, the left perpendicular is +y (screen y-down).
        const dir = resolveHitKnockbackDirection(SIDE_45, TRAVEL_RIGHT, ORIGIN, { x: 0, y: 5 });
        expect(dir.x).toBeCloseTo(HALF_ROOT_2, 10);
        expect(dir.y).toBeCloseTo(HALF_ROOT_2, 10);
    });

    it('sideOfTravel pushes toward the right side for a victim on the -perpendicular side', () => {
        const dir = resolveHitKnockbackDirection(SIDE_45, TRAVEL_RIGHT, ORIGIN, { x: 0, y: -5 });
        expect(dir.x).toBeCloseTo(HALF_ROOT_2, 10);
        expect(dir.y).toBeCloseTo(-HALF_ROOT_2, 10);
    });

    it('a victim exactly on the centre line takes the left side (+perpendicular)', () => {
        const dir = resolveHitKnockbackDirection(SIDE_45, TRAVEL_RIGHT, ORIGIN, { x: 10, y: 0 });
        expect(dir.x).toBeCloseTo(HALF_ROOT_2, 10);
        expect(dir.y).toBeCloseTo(HALF_ROOT_2, 10);
    });

    it('angleDeg sets how far off the travel direction the knockback points', () => {
        const at90 = resolveHitKnockbackDirection({ kind: 'sideOfTravel', angleDeg: 90 }, TRAVEL_RIGHT, ORIGIN, { x: 0, y: 5 });
        expect(at90.x).toBeCloseTo(0, 10);
        expect(at90.y).toBeCloseTo(1, 10);

        const at0 = resolveHitKnockbackDirection({ kind: 'sideOfTravel', angleDeg: 0 }, TRAVEL_RIGHT, ORIGIN, { x: 0, y: -5 });
        expect(at0.x).toBeCloseTo(1, 10);
        expect(at0.y).toBeCloseTo(0, 10);
    });
});
const IFRAME_KNOCKBACK_SOURCE: KnockbackSource = { unitId: 'caster', abilityId: 'test_kb' };

function makeKnockbackTarget(): Unit {
    return new Unit({
        id: 'target',
        x: 100,
        y: 100,
        hp: 100,
        maxHp: 100,
        speed: 50,
        teamId: 'enemy',
        ownerId: 'ai',
        characterId: 'enemy_melee',
        name: 'Target',
    });
}

function makeKnockbackCtx(overrides: Partial<KnockbackEngineCtx> = {}): KnockbackEngineCtx {
    return {
        gameTime: 1,
        roundNumber: 1,
        eventBus: new EventBus(),
        ...overrides,
    };
}

describe('computeAimedKnockbackParams', () => {
    const options = {
        landingMinDistance: FORCE_PUSH_LANDING_MIN_DISTANCE,
        landingMaxDistance: FORCE_PUSH_LANDING_MAX_DISTANCE,
        distanceScale: FORCE_PUSH_LANDING_DISTANCE_SCALE,
    };

    it('magnitude at max distance yields landing max displacement', () => {
        const params = computeAimedKnockbackParams(
            { x: 0, y: 0 },
            { x: FORCE_PUSH_LANDING_MAX_DISTANCE, y: 0 },
            TIER_3,
            options,
        );
        const vectorMag = Math.hypot(params.knockbackVector.x, params.knockbackVector.y);
        const displacement = vectorMag * KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR;
        expect(displacement).toBeCloseTo(FORCE_PUSH_LANDING_MAX_DISTANCE, 0);
    });

    it('airTime scales with distance toward max', () => {
        const nearParams = computeAimedKnockbackParams(
            { x: 0, y: 0 },
            { x: FORCE_PUSH_LANDING_MIN_DISTANCE, y: 0 },
            TIER_3,
            options,
        );
        const maxParams = computeAimedKnockbackParams(
            { x: 0, y: 0 },
            { x: FORCE_PUSH_LANDING_MAX_DISTANCE, y: 0 },
            TIER_3,
            options,
        );
        expect(maxParams.knockbackAirTime).toBeCloseTo(
            TIER_3.airTime * FORCE_PUSH_LANDING_DISTANCE_SCALE,
            5,
        );
        expect(maxParams.knockbackAirTime).toBeGreaterThan(nearParams.knockbackAirTime);
    });
});

describe('computeAimedKnockbackParams durationOverride', () => {
    const base = { landingMinDistance: 0, landingMaxDistance: 100, distanceScale: 1.25 };

    it('makes total flight time (air + slide) equal the override regardless of distance', () => {
        for (const d of [20, 60, 100]) {
            const p = computeAimedKnockbackParams({ x: 0, y: 0 }, { x: d, y: 0 }, TIER_3, {
                ...base,
                durationOverride: 0.2,
            });
            expect(p.knockbackAirTime + p.knockbackSlideTime).toBeCloseTo(0.2, 6);
            const disp = Math.hypot(p.knockbackVector.x, p.knockbackVector.y) * KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR;
            expect(disp).toBeCloseTo(d, 3);
        }
    });

    it('is unchanged when durationOverride is omitted', () => {
        const p = computeAimedKnockbackParams({ x: 0, y: 0 }, { x: 100, y: 0 }, TIER_3, base);
        expect(p.knockbackAirTime).toBeCloseTo(TIER_3.airTime * 1.25, 6);
    });
});

describe('tryApplyKnockbackByTier with iFrames', () => {
    it('fully resists knockback when target has iFrames', () => {
        const target = makeKnockbackTarget();
        target.ccArmour.hardFloor = 0;
        vi.spyOn(target, 'hasIFrames').mockReturnValue(true);
        const interrupt = vi.fn();
        const ctx = makeKnockbackCtx({ interruptUnitAndRefundAbilities: interrupt });

        const result = tryApplyKnockbackByTier(
            target,
            IFRAME_KNOCKBACK_TIER,
            IFRAME_KNOCKBACK_SOURCE,
            0,
            0,
            ctx,
        );

        expect(result.outcome).toBe('fully_resisted');
        expect(target.knockback).toBeNull();
        expect(interrupt).not.toHaveBeenCalled();
        expect(target.ccArmour.hardConsumed).toBe(0);
    });

    it('applies knockback when respectIFrames is false even if target has iFrames', () => {
        const target = makeKnockbackTarget();
        target.ccArmour.hardFloor = 0;
        vi.spyOn(target, 'hasIFrames').mockReturnValue(true);
        const ctx = makeKnockbackCtx({ respectIFrames: false });

        const result = tryApplyKnockbackByTier(
            target,
            IFRAME_KNOCKBACK_TIER,
            IFRAME_KNOCKBACK_SOURCE,
            0,
            0,
            ctx,
        );

        expect(result.outcome).toBe('applied');
        expect(target.knockback).not.toBeNull();
    });
});

describe('tryApplyKnockbackByTier with structures', () => {
    it('fully resists knockback on Structure-tagged units', () => {
        const target = makeKnockbackTarget();
        target.tags = [UnitTag.Structure];
        target.ccArmour.hardFloor = 0;
        const interrupt = vi.fn();
        const ctx = makeKnockbackCtx({ interruptUnitAndRefundAbilities: interrupt });

        const result = tryApplyKnockbackByTier(
            target,
            IFRAME_KNOCKBACK_TIER,
            IFRAME_KNOCKBACK_SOURCE,
            0,
            0,
            ctx,
        );

        expect(result.outcome).toBe('fully_resisted');
        expect(target.knockback).toBeNull();
        expect(interrupt).not.toHaveBeenCalled();
        expect(target.ccArmour.hardConsumed).toBe(0);
        expect(target.x).toBe(100);
        expect(target.y).toBe(100);
    });
});
