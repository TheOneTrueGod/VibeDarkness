import { describe, expect, it } from 'vitest';
import { TURRET_SHOT_COUNT } from '../../card_defs/10_armory_core/1004_DeployTurret/1004Constants';
import {
    TURRET_BARREL_LENGTH,
    TURRET_BODY_RADIUS,
    TURRET_FOLDED_BARREL_LENGTH,
    TURRET_OPEN_DURATION,
    turretDotOffset,
    turretOpenAmount,
    turretOpenShape,
} from './turretDeployPose';

const SPAWNED_AT = 2;

describe('turret deploy pose', () => {
    it('opens the barrel and moves the pips out from the hull', () => {
        expect(turretOpenShape(0).barrelLength).toBe(TURRET_FOLDED_BARREL_LENGTH);
        expect(turretOpenShape(1).barrelLength).toBe(TURRET_BARREL_LENGTH);
        const foldedFirst = turretDotOffset(0, 0, TURRET_SHOT_COUNT);
        const foldedLast = turretDotOffset(0, TURRET_SHOT_COUNT - 1, TURRET_SHOT_COUNT);
        const openFirst = turretDotOffset(1, 0, TURRET_SHOT_COUNT);
        const openLast = turretDotOffset(1, TURRET_SHOT_COUNT - 1, TURRET_SHOT_COUNT);
        const foldedSpan = Math.hypot(foldedFirst.x - foldedLast.x, foldedFirst.y - foldedLast.y);
        const openSpan = Math.hypot(openFirst.x - openLast.x, openFirst.y - openLast.y);
        expect(foldedSpan).toBeLessThan(openSpan);
        expect(Math.hypot(openFirst.x, openFirst.y)).toBeGreaterThan(TURRET_BODY_RADIUS);
        expect(Math.hypot(foldedFirst.x, foldedFirst.y)).toBeLessThan(TURRET_BODY_RADIUS);
    });

    it('opens on game time after the sentry exists, and stays open', () => {
        expect(turretOpenAmount(SPAWNED_AT, SPAWNED_AT)).toBe(0);
        expect(turretOpenAmount(SPAWNED_AT, SPAWNED_AT + TURRET_OPEN_DURATION)).toBe(1);
        expect(turretOpenAmount(SPAWNED_AT, SPAWNED_AT + TURRET_OPEN_DURATION * 2)).toBe(1);
    });
});
