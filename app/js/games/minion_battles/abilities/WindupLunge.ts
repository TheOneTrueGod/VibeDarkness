import type { Unit } from '../game/units/Unit';
import type { AbilityStatic } from './Ability';
import type { ActiveAbility, ResolvedTarget } from '../game/types';
import { findMeleeAimPixelInTargets } from './targeting';

export interface WindupLungeConfig {
    /** Max lunge distance in px (base, before terrain/research modifiers). */
    distance: number;
    /**
     * What the caster aims at when lunging.
     * 'unit'     — follow the locked-on unit's live position (default when a unit target exists).
     * 'position' — lunge toward the fixed pixel target recorded at cast time.
     */
    target?: 'unit' | 'position';
}

export interface WindupLungePayload {
    lungeStartX: number;
    lungeStartY: number;
    /** Target position recorded at cast time. */
    lungeTargetX: number;
    lungeTargetY: number;
    /**
     * Distance the caster will actually travel, committed at cast time.
     * = min(terrain-adjusted max, max(0, distToTarget − hitboxMaxRange))
     * Prevents over-lunge if the target was already inside the ability's base range.
     */
    effectiveLungeDistance: number;
    /** Present when lunge.target resolves to 'unit'. Followed live during windup. */
    lungeTargetUnitId?: string;
}

/** Minimal engine shape needed by lunge helpers. */
interface LungeEngineContext {
    getUnit(id: string): { x: number; y: number; isAlive?(): boolean } | undefined | null;
}

/**
 * Build and store the WindupLungePayload in `active.castPayload`.
 * Call this from a custom `beginActiveCast` implementation when the ability has a
 * `lunge` config but also needs its own setup logic (e.g. spawning charge-up VFX).
 * When using `defineAbility`, this is called automatically.
 */
export function setupWindupLungePayload(
    engine: unknown,
    caster: Unit,
    targets: ResolvedTarget[],
    active: ActiveAbility,
    lunge: WindupLungeConfig,
    hitboxMaxRange: number | null,
): void {
    const eng = engine as LungeEngineContext;
    const maxDist = caster.getLungeDistance(engine, lunge.distance);

    const primary = targets[0];
    let tx: number | undefined;
    let ty: number | undefined;
    let unitId: string | undefined;

    // If the targets array carries a trailing aim pixel (appended by buildMeleeSelectOrderTargets),
    // use it as a fixed-position lunge destination so the player lunges toward their click, not the unit.
    const aimPixel = findMeleeAimPixelInTargets(targets);
    if (aimPixel != null) {
        tx = aimPixel.x;
        ty = aimPixel.y;
        // unitId intentionally omitted — fixed position lunge, not unit-follow.
    } else {
        const resolveToUnit = (lunge.target ?? 'unit') === 'unit';
        if (resolveToUnit && primary?.type === 'unit' && primary.unitId != null) {
            const u = eng.getUnit(primary.unitId);
            if (u != null) { tx = u.x; ty = u.y; unitId = primary.unitId; }
        }
        if (tx === undefined && primary?.type === 'pixel' && primary.position != null) {
            tx = primary.position.x;
            ty = primary.position.y;
        }
    }
    if (tx === undefined || ty === undefined) return;

    const dx = tx - caster.x;
    const dy = ty - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const needed = Math.max(0, dist - (hitboxMaxRange ?? 0));
    const effective = Math.min(maxDist, needed);

    const payload: WindupLungePayload = {
        lungeStartX: caster.x,
        lungeStartY: caster.y,
        lungeTargetX: tx,
        lungeTargetY: ty,
        effectiveLungeDistance: effective,
        ...(unitId !== undefined ? { lungeTargetUnitId: unitId } : {}),
    };
    active.castPayload = payload;
}

/**
 * Advance the caster's physical position along the windup lunge each tick.
 *
 * Called during the windup phase when `ability.lunge` is configured and a valid
 * `WindupLungePayload` has been stored in `active.castPayload`.
 */
export function advanceWindupLunge(
    unit: Unit,
    payload: WindupLungePayload,
    ability: AbilityStatic,
    currentTime: number,
    windupEnd: number,
    engine: LungeEngineContext,
): void {
    // Resolve live target position (unit may move during windup).
    let tx = payload.lungeTargetX;
    let ty = payload.lungeTargetY;
    if (payload.lungeTargetUnitId) {
        const u = engine.getUnit(payload.lungeTargetUnitId);
        if (u != null && (u.isAlive == null || u.isAlive())) { tx = u.x; ty = u.y; }
    }

    // Direction from the lunge origin toward the (possibly updated) target.
    const dx = tx - payload.lungeStartX;
    const dy = ty - payload.lungeStartY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.5) return;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Hitbox base range = total getRange − lunge.distance (lunge extended it).
    if (ability.getRange == null) return;
    const rangeResult = ability.getRange(unit);
    if (rangeResult == null) return;
    const hitboxRange = rangeResult.maxRange - ability.lunge!.distance;

    // The current gap between lunge origin and target, minus the hitbox reach.
    // If the target moved closer the lunge shortens; it never exceeds the committed max.
    const currentNeeded = Math.max(0, dist - hitboxRange);
    const actualLunge = Math.min(payload.effectiveLungeDistance, currentNeeded);

    // Linear interpolation over the windup duration.
    const progress = windupEnd > 0 ? Math.min(1, currentTime / windupEnd) : 1;

    unit.x = payload.lungeStartX + dirX * actualLunge * progress;
    unit.y = payload.lungeStartY + dirY * actualLunge * progress;
    unit.invalidateMovementPath();
}
