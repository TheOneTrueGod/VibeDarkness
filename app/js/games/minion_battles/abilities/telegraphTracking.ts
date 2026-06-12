/**
 * Windup telegraph target tracking — updates castPayload each tick so the shrinking
 * circle and aim line follow a locked unit until dodge or tether break.
 */

import type { AbilityStatic } from './Ability';
import type { Unit } from '../game/units/Unit';
import type { ActiveAbility } from '../game/types';
import type { EngineContext } from '../game/EngineContext';
import {
    isAbilityTimingInterval,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from './abilityTimings';
import { isSelectTargetDef } from './timingTargetDef';
import type { ResolvedTarget } from '../game/types';
import {
    evaluateTargetLockBreak,
    getLockOnRange,
    spawnDodgedFloatingText,
} from './targetLockTracking';

export interface TelegraphCastPayload {
    telegraphTargetX: number;
    telegraphTargetY: number;
    /** Set when trackTarget is true and primary target is a unit. */
    telegraphTargetUnitId?: string;
    /** Frozen aim point after dodge or tether break; null/undefined while still tracking. */
    telegraphLockedPosition?: { x: number; y: number } | null;
}

export function asTelegraphPayload(castPayload: unknown): TelegraphCastPayload | null {
    if (castPayload == null || typeof castPayload !== 'object') return null;
    const p = castPayload as TelegraphCastPayload;
    if (typeof p.telegraphTargetX !== 'number' || typeof p.telegraphTargetY !== 'number') return null;
    return p;
}

/** Walk timing intervals for the first select-target hitbox maxRange (same as defineAbility). */
export function getAbilityHitboxMaxRange(ability: AbilityStatic, caster: Unit, engine: EngineContext): number | null {
    const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, caster, engine));
    for (const interval of intervals) {
        if (!isAbilityTimingInterval(interval)) continue;
        if (interval.targetDef && isSelectTargetDef(interval.targetDef)) {
            const hitbox = interval.targetDef.hitbox;
            if (typeof hitbox.maxRange === 'number') {
                return hitbox.maxRange;
            }
        }
    }
    return null;
}

function shouldTrackTelegraph(ability: AbilityStatic): boolean {
    return ability.telegraph?.trackTarget === true;
}

/**
 * Initialize castPayload for declarative telegraphs at cast start.
 * Returns the payload object to assign to active.castPayload, or null when no telegraph coords.
 */
export function initTelegraphCastPayload(
    ability: AbilityStatic,
    targets: ResolvedTarget[],
    engine: EngineContext,
): TelegraphCastPayload | null {
    if (!ability.telegraph) return null;

    const t = targets[0];
    let tx: number | undefined;
    let ty: number | undefined;
    let unitId: string | undefined;

    if (t) {
        if (t.type === 'unit' && t.unitId) {
            const u = engine.getUnit(t.unitId);
            if (u) {
                tx = u.x;
                ty = u.y;
                if (shouldTrackTelegraph(ability)) {
                    unitId = t.unitId;
                }
            }
        } else if (t.type === 'pixel' && t.position) {
            tx = t.position.x;
            ty = t.position.y;
        }
    }

    if (tx === undefined || ty === undefined) return null;

    const payload: TelegraphCastPayload = {
        telegraphTargetX: tx,
        telegraphTargetY: ty,
    };
    if (unitId !== undefined) {
        payload.telegraphTargetUnitId = unitId;
        payload.telegraphLockedPosition = null;
    }
    return payload;
}

function applyTelegraphLock(
    payload: TelegraphCastPayload,
    lockPos: { x: number; y: number },
    engine: EngineContext,
): void {
    payload.telegraphLockedPosition = lockPos;
    payload.telegraphTargetX = lockPos.x;
    payload.telegraphTargetY = lockPos.y;
    spawnDodgedFloatingText(engine, lockPos.x, lockPos.y);
}

/**
 * Advance tracking telegraph aim during windup. Mutates active.castPayload in place.
 */
export function updateTelegraphTracking(
    caster: Unit,
    active: ActiveAbility,
    ability: AbilityStatic,
    elapsed: number,
    engine: EngineContext,
): void {
    if (!shouldTrackTelegraph(ability)) return;
    if (elapsed >= ability.prefireTime) return;

    const payload = asTelegraphPayload(active.castPayload);
    if (!payload?.telegraphTargetUnitId) return;

    if (payload.telegraphLockedPosition != null) {
        payload.telegraphTargetX = payload.telegraphLockedPosition.x;
        payload.telegraphTargetY = payload.telegraphLockedPosition.y;
        return;
    }

    const target = engine.getUnit(payload.telegraphTargetUnitId);
    if (!target) return;

    const lockOnRange = getLockOnRange(getAbilityHitboxMaxRange(ability, caster, engine));
    const lockPos = evaluateTargetLockBreak(caster, target, lockOnRange);
    if (lockPos) {
        applyTelegraphLock(payload, lockPos, engine);
    } else {
        payload.telegraphTargetX = target.x;
        payload.telegraphTargetY = target.y;
    }
}

/**
 * Lock a tracking telegraph when its target enters an evade ability (called from evade-break loop).
 */
export function lockTelegraphOnTargetEvade(
    caster: Unit,
    active: ActiveAbility,
    ability: AbilityStatic,
    dodgingUnitId: string,
    snapshot: { x: number; y: number },
    elapsed: number,
    engine: EngineContext,
): void {
    if (!shouldTrackTelegraph(ability)) return;
    if (elapsed >= ability.prefireTime) return;

    const payload = asTelegraphPayload(active.castPayload);
    if (!payload?.telegraphTargetUnitId) return;
    if (payload.telegraphTargetUnitId !== dodgingUnitId) return;
    if (payload.telegraphLockedPosition != null) return;

    applyTelegraphLock(payload, snapshot, engine);
}
