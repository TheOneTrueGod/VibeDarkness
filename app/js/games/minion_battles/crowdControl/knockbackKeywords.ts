import type { Unit, KnockbackSource } from '../game/units/Unit';
import { ExposedBuff } from '../buffs/ExposedBuff';
import { getDirectionFromTo } from '../abilities/targetHelpers';
import { getEffectiveHardCcThreshold, onSuccessfulHardCcLand, recordHardCcArmourEvent } from './ccArmourState';
import type { ApplyKnockbackParams } from '../game/units/unitTypes';

export type ForcedMovementCollisionOpts = Pick<
    ApplyKnockbackParams,
    'collideWithUnits' | 'bounceOffTerrain' | 'unitCollisionStartFraction'
>;

// ---- Tier table ----

export interface KnockbackTierDef {
    airTime: number;
    slideTime: number;
    magnitude: number;
}

const KNOCKBACK_TIER_DEFS: Record<number, KnockbackTierDef> = {
    1: { airTime: 0.10, slideTime: 0.05, magnitude: 12 },
    2: { airTime: 0.25, slideTime: 0.15, magnitude: 28 },
    3: { airTime: 0.50, slideTime: 0.30, magnitude: 45 },
    4: { airTime: 0.65, slideTime: 0.40, magnitude: 65 },
};

export function getKnockbackTierDef(tier: number): KnockbackTierDef | null {
    return KNOCKBACK_TIER_DEFS[tier] ?? null;
}

/** Slide phase applies half the air vector; total displacement = air + slide = (1 + this) × vector magnitude. */
export const KNOCKBACK_SLIDE_DISPLACEMENT_FRACTION = 0.5;

export const KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR = 1 + KNOCKBACK_SLIDE_DISPLACEMENT_FRACTION;

// ---- Result type ----

export type KnockbackAttemptOutcome = 'fully_resisted' | 'absorbed' | 'applied';
export type KnockbackAttemptResult = { outcome: KnockbackAttemptOutcome };

// ---- Engine context ----

export interface KnockbackEngineCtx {
    gameTime: number;
    roundNumber: number;
    eventBus: unknown;
    interruptUnitAndRefundAbilities?(unit: Unit): void;
    /**
     * When true (default), targets with active iFrames fully resist tier forced movement
     * (no launch, no interrupt, no armour consume) — same class as juggernaut.
     * Set false for rare true-strike (unused by live cards).
     */
    respectIFrames?: boolean;
}

// ---- Engine context factory ----

/**
 * Build a `KnockbackEngineCtx` from any object that satisfies `AbilityEngineContext`.
 * Centralises the `roundNumber ?? 1` fallback and `bind` call that appear in every
 * `applyKnockbackToHits` / `tryApplyKnockbackByTier` call site.
 */
export function knockbackCtxFromEngine(engine: {
    gameTime: number;
    roundNumber?: number;
    eventBus: unknown;
    interruptUnitAndRefundAbilities?(unit: Unit): void;
}): KnockbackEngineCtx {
    return {
        gameTime: engine.gameTime,
        roundNumber: engine.roundNumber ?? 1,
        eventBus: engine.eventBus,
        interruptUnitAndRefundAbilities: engine.interruptUnitAndRefundAbilities?.bind(engine),
    };
}

// ---- Main entry point ----

/**
 * Apply knockback by tier, honouring the target's knockbackResistance and CC armour gate.
 *
 * - Effective tier = tier − target.knockbackResistance.
 * - Effective tier ≤ 0 → fully resisted; CC armour is NOT consumed.
 * - Effective tier > 0 → treated as hard CC (shares hardCcArmourConsumed with stun).
 *   - Target already exposed: physically launch (break-stun window is the payoff; no armour change).
 *   - No armour: knockback launches the target.
 *   - Absorbed: nothing happens.
 *   - Armour break, ccArmourBreakStunDuration > 0: ExposedBuff + break stun (no physical launch).
 *   - Armour break, ccArmourBreakStunDuration = 0: knockback launches target + ExposedBuff.
 */
type TierForcedMovementLaunch = (target: Unit, tierDef: KnockbackTierDef) => void;

function _tryApplyTierForcedMovement(
    target: Unit,
    tier: number,
    engine: KnockbackEngineCtx,
    launch: TierForcedMovementLaunch,
): KnockbackAttemptResult {
    // Units in a juggernaut window are immune to knockback — no armour consumed, no launch.
    if (target.isInJuggernautWindow(engine.gameTime)) {
        return { outcome: 'fully_resisted' };
    }

    // Active iFrames resist combat knockback/pull the same way (unless true-strike opt-out).
    const respectIFrames = engine.respectIFrames !== false;
    if (respectIFrames && target.hasIFrames(engine.gameTime)) {
        return { outcome: 'fully_resisted' };
    }

    const effectiveTier = tier - target.knockbackResistance;
    if (effectiveTier <= 0) return { outcome: 'fully_resisted' };

    const tierDef = getKnockbackTierDef(effectiveTier);
    if (!tierDef) return { outcome: 'fully_resisted' };

    if (target.hasBuff('exposed')) {
        // Boss is in their break-stun window — physically launch them without
        // touching the armour counter or stacking another ExposedBuff.
        launch(target, tierDef);
        return { outcome: 'applied' };
    }

    const threshold = getEffectiveHardCcThreshold(target);

    if (threshold <= 0) {
        launch(target, tierDef);
        return { outcome: 'applied' };
    }

    if (target.ccArmour.hardConsumed < threshold) {
        target.ccArmour.hardConsumed += 1;
        recordHardCcArmourEvent(target, 'absorbed', engine.gameTime);
        return { outcome: 'absorbed' };
    }

    // Armour breaks.
    target.ccArmour.hardConsumed = 0;
    onSuccessfulHardCcLand(target);
    recordHardCcArmourEvent(target, 'landed', engine.gameTime);
    if (target.ccArmour.breakStunDuration > 0) {
        // A fixed break stun is defined — apply it instead of physical knockback.
        target.addBuff(new ExposedBuff(target.ccArmour.breakStunDuration), engine.gameTime, engine.roundNumber);
        engine.interruptUnitAndRefundAbilities?.(target);
    } else {
        // No break stun defined — the knockback itself is the CC payoff.
        launch(target, tierDef);
        target.addBuff(new ExposedBuff(tierDef.airTime + tierDef.slideTime), engine.gameTime, engine.roundNumber);
    }
    return { outcome: 'applied' };
}

export function tryApplyKnockbackByTier(
    target: Unit,
    tier: number,
    source: KnockbackSource,
    casterX: number,
    casterY: number,
    engine: KnockbackEngineCtx,
    collisionOpts?: ForcedMovementCollisionOpts,
): KnockbackAttemptResult {
    return _tryApplyTierForcedMovement(target, tier, engine, (t, tierDef) => {
        _launchKnockback(t, tierDef, source, casterX, casterY, engine, collisionOpts);
    });
}

/**
 * Apply pull by tier — same resistance/CC-armour/exposed gating as knockback, but the launch
 * vector points toward `pullPoint` and its magnitude is clamped so total displacement never
 * overshoots the point (air + slide accounted via {@link KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR}).
 */
export function tryApplyPullByTier(
    target: Unit,
    tier: number,
    source: KnockbackSource,
    pullPoint: { x: number; y: number },
    engine: KnockbackEngineCtx,
    collisionOpts?: ForcedMovementCollisionOpts,
): KnockbackAttemptResult {
    return _tryApplyTierForcedMovement(target, tier, engine, (t, tierDef) => {
        _launchPull(t, tierDef, source, pullPoint, engine, collisionOpts);
    });
}

/**
 * Apply knockback along an explicit unit-vector direction rather than away from a source point.
 * Implemented by synthesising a source point one pixel behind the target along the direction,
 * so `_launchKnockback`'s away-from-source computation resolves to `direction`.
 */
export function applyDirectionalKnockback(
    target: Unit,
    tier: number,
    direction: { x: number; y: number },
    source: KnockbackSource,
    engine: KnockbackEngineCtx,
    collisionOpts?: ForcedMovementCollisionOpts,
): KnockbackAttemptResult {
    // Place a synthetic source one unit behind the target along the direction vector,
    // so the computed away-vector equals the passed direction.
    const synthX = target.x - direction.x;
    const synthY = target.y - direction.y;
    return tryApplyKnockbackByTier(target, tier, source, synthX, synthY, engine, collisionOpts);
}

export interface AimedKnockbackOptions {
    landingMinDistance: number;
    landingMaxDistance: number;
    /** Air-time multiplier at max landing distance relative to tier baseline (e.g. 1.25). */
    distanceScale: number;
}

/**
 * Compute knockback vector and timings so total displacement aims toward `landing`.
 * Distance is clamped to `[landingMinDistance, landingMaxDistance]`; air time scales with distance.
 */
export function computeAimedKnockbackParams(
    start: { x: number; y: number },
    landing: { x: number; y: number },
    tierDef: KnockbackTierDef,
    options: AimedKnockbackOptions,
): Pick<ApplyKnockbackParams, 'knockbackVector' | 'knockbackAirTime' | 'knockbackSlideTime'> {
    const dx = landing.x - start.x;
    const dy = landing.y - start.y;
    let dist = Math.hypot(dx, dy);
    dist = Math.min(options.landingMaxDistance, Math.max(options.landingMinDistance, dist));

    const rawDist = Math.hypot(dx, dy);
    const dirX = rawDist < 1e-6 ? 1 : dx / rawDist;
    const dirY = rawDist < 1e-6 ? 0 : dy / rawDist;

    const magnitude = dist / KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR;
    const t = options.landingMaxDistance > 0 ? dist / options.landingMaxDistance : 0;
    const airTime = tierDef.airTime * (1 + (options.distanceScale - 1) * t);
    const slideRatio = tierDef.airTime > 0 ? tierDef.slideTime / tierDef.airTime : 0;
    const slideTime = airTime * slideRatio;

    return {
        knockbackVector: { x: dirX * magnitude, y: dirY * magnitude },
        knockbackAirTime: airTime,
        knockbackSlideTime: slideTime,
    };
}

/**
 * Apply aimed knockback with tier-based CC gating; vector and timings reach toward `landing`.
 */
export function tryApplyAimedKnockbackByTier(
    target: Unit,
    ccTier: number,
    landing: { x: number; y: number },
    source: KnockbackSource,
    engine: KnockbackEngineCtx,
    options: AimedKnockbackOptions,
    collisionOpts?: ForcedMovementCollisionOpts,
): KnockbackAttemptResult {
    return _tryApplyTierForcedMovement(target, ccTier, engine, (t, tierDef) => {
        const params = computeAimedKnockbackParams(
            { x: t.x, y: t.y },
            landing,
            tierDef,
            options,
        );
        t.applyKnockback(
            {
                ...params,
                knockbackSource: source,
                collideWithUnits: collisionOpts?.collideWithUnits,
                bounceOffTerrain: collisionOpts?.bounceOffTerrain,
                unitCollisionStartFraction: collisionOpts?.unitCollisionStartFraction,
            },
            engine.eventBus as never,
            (u) => engine.interruptUnitAndRefundAbilities?.(u),
        );
    });
}

function _launchKnockback(
    target: Unit,
    tierDef: KnockbackTierDef,
    source: KnockbackSource,
    casterX: number,
    casterY: number,
    engine: KnockbackEngineCtx,
    collisionOpts?: ForcedMovementCollisionOpts,
): void {
    const { dirX, dirY } = getDirectionFromTo(casterX, casterY, target.x, target.y);
    target.applyKnockback(
        {
            knockbackVector: { x: dirX * tierDef.magnitude, y: dirY * tierDef.magnitude },
            knockbackAirTime: tierDef.airTime,
            knockbackSlideTime: tierDef.slideTime,
            knockbackSource: source,
            collideWithUnits: collisionOpts?.collideWithUnits,
            bounceOffTerrain: collisionOpts?.bounceOffTerrain,
            unitCollisionStartFraction: collisionOpts?.unitCollisionStartFraction,
        },
        engine.eventBus as never,
        (u) => engine.interruptUnitAndRefundAbilities?.(u),
    );
}

function _launchPull(
    target: Unit,
    tierDef: KnockbackTierDef,
    source: KnockbackSource,
    pullPoint: { x: number; y: number },
    engine: KnockbackEngineCtx,
    collisionOpts?: ForcedMovementCollisionOpts,
): void {
    const { dirX, dirY, dist } = getDirectionFromTo(target.x, target.y, pullPoint.x, pullPoint.y);
    if (dist <= 0) return;

    const maxVectorMag = dist / KNOCKBACK_TOTAL_DISPLACEMENT_FACTOR;
    const magnitude = Math.min(tierDef.magnitude, maxVectorMag);

    target.applyKnockback(
        {
            knockbackVector: { x: dirX * magnitude, y: dirY * magnitude },
            knockbackAirTime: tierDef.airTime,
            knockbackSlideTime: tierDef.slideTime,
            knockbackSource: source,
            collideWithUnits: collisionOpts?.collideWithUnits,
            bounceOffTerrain: collisionOpts?.bounceOffTerrain,
            unitCollisionStartFraction: collisionOpts?.unitCollisionStartFraction,
        },
        engine.eventBus as never,
        (u) => engine.interruptUnitAndRefundAbilities?.(u),
    );
}
