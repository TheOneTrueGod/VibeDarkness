/**
 * Shared target lock-on / tether break logic for melee tracking and windup telegraphs.
 * Aligns tether range with MeleeAttackBehaviour guaranteed-hit range.
 */

import type { Unit } from '../game/units/Unit';
import { abilityHasTag } from './Ability';
import { Effect } from '../game/effects/Effect';
import type { DamageNumberMotionData } from '../game/effects/damageNumberMotion';

/** Extra px beyond hitbox maxRange before a locked target breaks tether. */
export const LOCK_ON_TETHER_EXTRA = 100;

export function getLockOnRange(hitboxMaxRange: number | null): number {
    if (hitboxMaxRange === null) return LOCK_ON_TETHER_EXTRA;
    return hitboxMaxRange + LOCK_ON_TETHER_EXTRA;
}

interface LockBreakEngine {
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
}

export function spawnDodgedFloatingText(engine: LockBreakEngine, x: number, y: number): void {
    const motionData: DamageNumberMotionData = {
        amount: 0,
        color: 0xfacc15,
        originX: x,
        originY: y,
        dirX: 0,
        dirY: -1,
        flightPx: 48,
        arcPx: 36,
    };
    engine.addEffect(
        new Effect({
            x,
            y,
            duration: 0.92,
            effectType: 'FloatingText',
            effectData: motionData,
        }),
    );
}

export function unitHasActiveEvade(unit: Unit): boolean {
    return unit.activeAbilities.some((a) => abilityHasTag(a.abilityId, 'evade'));
}

/**
 * Returns a freeze position when tracking should stop, or null while still following live movement.
 */
export function evaluateTargetLockBreak(
    caster: Unit,
    target: Unit,
    lockOnRange: number,
): { x: number; y: number } | null {
    if (unitHasActiveEvade(target)) {
        return { x: target.x, y: target.y };
    }
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    if (Math.sqrt(dx * dx + dy * dy) > lockOnRange) {
        return { x: target.x, y: target.y };
    }
    return null;
}

export function resolveTrackingAimPoint(
    engine: { getUnit(id: string): Unit | undefined },
    unitId: string | null,
    lockedPosition: { x: number; y: number } | null,
    fallback: { x: number; y: number },
): { x: number; y: number } {
    if (lockedPosition !== null) return lockedPosition;
    if (unitId !== null) {
        const unit = engine.getUnit(unitId);
        if (unit) return { x: unit.x, y: unit.y };
    }
    return fallback;
}
