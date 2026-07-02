import type { Unit, KnockbackSource } from '../game/units/Unit';
import { ExposedBuff } from '../buffs/ExposedBuff';
import { getDirectionFromTo } from '../abilities/targetHelpers';
import { getEffectiveHardCcThreshold, onSuccessfulHardCcLand, recordHardCcArmourEvent } from './ccArmourState';

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
};

export function getKnockbackTierDef(tier: number): KnockbackTierDef | null {
    return KNOCKBACK_TIER_DEFS[tier] ?? null;
}

// ---- Result type ----

export type KnockbackAttemptOutcome = 'fully_resisted' | 'absorbed' | 'applied';
export type KnockbackAttemptResult = { outcome: KnockbackAttemptOutcome };

// ---- Engine context ----

export interface KnockbackEngineCtx {
    gameTime: number;
    roundNumber: number;
    eventBus: unknown;
    interruptUnitAndRefundAbilities?(unit: Unit): void;
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
export function tryApplyKnockbackByTier(
    target: Unit,
    tier: number,
    source: KnockbackSource,
    casterX: number,
    casterY: number,
    engine: KnockbackEngineCtx,
): KnockbackAttemptResult {
    // Units in a juggernaut window are immune to knockback — no armour consumed, no launch.
    if (target.isInJuggernautWindow(engine.gameTime)) {
        return { outcome: 'fully_resisted' };
    }

    const effectiveTier = tier - target.knockbackResistance;
    if (effectiveTier <= 0) return { outcome: 'fully_resisted' };

    const tierDef = getKnockbackTierDef(effectiveTier);
    if (!tierDef) return { outcome: 'fully_resisted' };

    if (target.hasBuff('exposed')) {
        // Boss is in their break-stun window — physically launch them without
        // touching the armour counter or stacking another ExposedBuff.
        _launchKnockback(target, tierDef, source, casterX, casterY, engine);
        return { outcome: 'applied' };
    }

    const threshold = getEffectiveHardCcThreshold(target);

    if (threshold <= 0) {
        _launchKnockback(target, tierDef, source, casterX, casterY, engine);
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
        _launchKnockback(target, tierDef, source, casterX, casterY, engine);
        target.addBuff(new ExposedBuff(tierDef.airTime + tierDef.slideTime), engine.gameTime, engine.roundNumber);
    }
    return { outcome: 'applied' };
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
): KnockbackAttemptResult {
    // Place a synthetic source one unit behind the target along the direction vector,
    // so the computed away-vector equals the passed direction.
    const synthX = target.x - direction.x;
    const synthY = target.y - direction.y;
    return tryApplyKnockbackByTier(target, tier, source, synthX, synthY, engine);
}

function _launchKnockback(
    target: Unit,
    tierDef: KnockbackTierDef,
    source: KnockbackSource,
    casterX: number,
    casterY: number,
    engine: KnockbackEngineCtx,
): void {
    const { dirX, dirY } = getDirectionFromTo(casterX, casterY, target.x, target.y);
    target.applyKnockback(
        {
            knockbackVector: { x: dirX * tierDef.magnitude, y: dirY * tierDef.magnitude },
            knockbackAirTime: tierDef.airTime,
            knockbackSlideTime: tierDef.slideTime,
            knockbackSource: source,
        },
        engine.eventBus as never,
        (u) => engine.interruptUnitAndRefundAbilities?.(u),
    );
}
