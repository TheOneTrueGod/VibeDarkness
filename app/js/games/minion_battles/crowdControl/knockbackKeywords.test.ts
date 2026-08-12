import { describe, expect, it, vi } from 'vitest';
import {
    computeAimedKnockbackParams,
    getKnockbackTierDef,
    KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR,
    tryApplyKnockbackByTier,
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

const TIER_3 = getKnockbackTierDef(3)!;
const IFRAME_KNOCKBACK_TIER = 3;
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
