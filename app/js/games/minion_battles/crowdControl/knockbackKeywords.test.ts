import { describe, expect, it } from 'vitest';
import {
    computeAimedKnockbackParams,
    getKnockbackTierDef,
    KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR,
} from './knockbackKeywords';
import {
    FORCE_PUSH_LANDING_DISTANCE_SCALE,
    FORCE_PUSH_LANDING_MAX_DISTANCE,
    FORCE_PUSH_LANDING_MIN_DISTANCE,
} from '../card_defs/09_gravity_core/gravityConstants';

const TIER_3 = getKnockbackTierDef(3)!;

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
