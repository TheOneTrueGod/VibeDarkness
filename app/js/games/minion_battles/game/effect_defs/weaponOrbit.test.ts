import { describe, expect, it } from 'vitest';
import {
    CONJURE_SWORD_COUNT,
    CONJURE_SWORD_FADE_PORTION,
    CONJURE_SWORD_ORBIT_RADIUS,
    CONJURE_SWORD_ORBIT_TURNS,
} from '../../card_defs/10_armory_core/armoryConstants';
import { DEFAULT_WEAPON_TIP_OFFSET } from '../conjuredWeapons/registry';
import {
    DEFAULT_WEAPON_ORBIT_COUNT,
    DEFAULT_WEAPON_ORBIT_FADE_PORTION,
    DEFAULT_WEAPON_ORBIT_RADIUS,
    DEFAULT_WEAPON_ORBIT_TURNS,
    weaponOrbitPose,
    type WeaponOrbitShape,
} from './weaponOrbit';

const MID_CAST = 0.5;

const ARMORY_ORBIT: WeaponOrbitShape = {
    count: CONJURE_SWORD_COUNT,
    radius: CONJURE_SWORD_ORBIT_RADIUS,
    turns: CONJURE_SWORD_ORBIT_TURNS,
    fadePortion: CONJURE_SWORD_FADE_PORTION,
    tipOffsetRad: DEFAULT_WEAPON_TIP_OFFSET,
};

describe('weaponOrbitPose', () => {
    it('engine defaults equal the Armory conjure orbit', () => {
        expect(DEFAULT_WEAPON_ORBIT_COUNT).toBe(CONJURE_SWORD_COUNT);
        expect(DEFAULT_WEAPON_ORBIT_RADIUS).toBe(CONJURE_SWORD_ORBIT_RADIUS);
        expect(DEFAULT_WEAPON_ORBIT_TURNS).toBe(CONJURE_SWORD_ORBIT_TURNS);
        expect(DEFAULT_WEAPON_ORBIT_FADE_PORTION).toBe(CONJURE_SWORD_FADE_PORTION);
        for (const progress of [0, 0.05, 0.3, MID_CAST, 0.95, 1]) {
            expect(weaponOrbitPose(1, progress)).toEqual(weaponOrbitPose(1, progress, ARMORY_ORBIT));
        }
    });

    it('starts and ends on the caster', () => {
        for (let i = 0; i < CONJURE_SWORD_COUNT; i++) {
            expect(Math.hypot(weaponOrbitPose(i, 0, ARMORY_ORBIT).x, weaponOrbitPose(i, 0, ARMORY_ORBIT).y)).toBeCloseTo(0);
            expect(Math.hypot(weaponOrbitPose(i, 1, ARMORY_ORBIT).x, weaponOrbitPose(i, 1, ARMORY_ORBIT).y)).toBeCloseTo(0);
        }
    });

    it('spreads four blades around the caster at the widest point', () => {
        const poses = Array.from({ length: CONJURE_SWORD_COUNT }, (_, index) => weaponOrbitPose(index, MID_CAST, ARMORY_ORBIT));
        for (const pose of poses) {
            expect(Math.hypot(pose.x, pose.y)).toBeCloseTo(CONJURE_SWORD_ORBIT_RADIUS);
            expect(pose.alpha).toBe(1);
        }
        const first = poses[0]!;
        const second = poses[1]!;
        expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(CONJURE_SWORD_ORBIT_RADIUS);
    });

    it('takes its count, radius and tip offset from the shape', () => {
        const shape: WeaponOrbitShape = { count: 3, radius: 20, turns: 0, fadePortion: 0.1, tipOffsetRad: 0 };
        const poses = Array.from({ length: shape.count }, (_, index) => weaponOrbitPose(index, MID_CAST, shape));
        for (const pose of poses) {
            expect(Math.hypot(pose.x, pose.y)).toBeCloseTo(shape.radius);
        }
        expect(poses[1]!.rotation - poses[0]!.rotation).toBeCloseTo((Math.PI * 2) / shape.count);
        expect(poses[0]!.rotation).toBeCloseTo(0);
    });
});
