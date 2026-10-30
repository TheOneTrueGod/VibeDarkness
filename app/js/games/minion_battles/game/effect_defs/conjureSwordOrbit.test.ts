import { describe, expect, it } from 'vitest';
import {
    CONJURE_SWORD_COUNT,
    CONJURE_SWORD_ORBIT_RADIUS,
} from '../../card_defs/10_armory_core/armoryConstants';
import { conjureSwordPose } from './conjureSwordOrbit';

const MID_CAST = 0.5;

describe('conjureSwordPose', () => {
    it('starts and ends on the caster', () => {
        for (let i = 0; i < CONJURE_SWORD_COUNT; i++) {
            expect(Math.hypot(conjureSwordPose(i, 0).x, conjureSwordPose(i, 0).y)).toBeCloseTo(0);
            expect(Math.hypot(conjureSwordPose(i, 1).x, conjureSwordPose(i, 1).y)).toBeCloseTo(0);
        }
    });

    it('spreads four blades around the caster at the widest point', () => {
        const poses = Array.from({ length: CONJURE_SWORD_COUNT }, (_, index) => conjureSwordPose(index, MID_CAST));
        for (const pose of poses) {
            expect(Math.hypot(pose.x, pose.y)).toBeCloseTo(CONJURE_SWORD_ORBIT_RADIUS);
            expect(pose.alpha).toBe(1);
        }
        const first = poses[0]!;
        const second = poses[1]!;
        expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(CONJURE_SWORD_ORBIT_RADIUS);
    });
});
