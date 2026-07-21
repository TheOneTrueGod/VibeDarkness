/**
 * defineMeleeStrike — archetype factory for simple melee strike abilities.
 *
 * Produces a full `AbilityStatic` from a compact config object, eliminating the
 * repeated wiring of meleeLineHitbox + CastBehaviours.MeleeAttack() + defineAbility()
 * that appears across the bite and punch ability families.
 *
 * Capabilities:
 *  - Auto-generates timing intervals (windup / active / cooldown) from durations.
 *  - Wires `.withDamage(damage)`, `.withImpact(impactType)`, `.withSlide(slide)`,
 *    `.withImpactAt(impactAt)`, `.withKnockback(knockbackTier)` declaratively.
 *  - Supports an optional `onDamage` per-hit rider (bleed, bonus-damage, etc.).
 *  - Forwards `telegraph`, `abilityEvents`, `maxHits`, and all standard AbilityStatic meta.
 *  - Defaults `movementLock.until` to `windupEnd + activeDuration` when not supplied.
 *  - Passes through aiSettings; auto-derives maxRange from the hitbox when not provided.
 */

import type {
    AbilityRecoveryRule,
    AbilityStatic,
    AbilityTelegraph,
    AbilityEventType,
    AbilityNinjutsuConfig,
} from '../Ability';
import type { AbilityEventRule } from '../events/AbilityEventRule';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { Unit } from '../../game/units/Unit';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import { CastBehaviours } from '../CastBehaviours';
import { meleeLineHitbox } from '../../hitboxes';
import type { HitboxSpec } from '../../hitboxes/HitboxSpec';
import { defineAbility, type AbilityDefInput } from '../defineAbility';
import type { WindupLungeConfig } from '../WindupLunge';
import { getAbilityDamageForDisplay } from '../damageModifiers';
import { resolveTooltipContext } from '../abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../tooltipTokens';

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface MeleeStrikeConfig {
    // ---- Identity ----
    id: string;
    name: string;
    image: string;

    // ---- Combat numbers ----
    /** Flat damage amount passed to `.withDamage(damage)`. */
    damage: number;
    /** Knockback tier passed to `.withKnockback(tier)`. Omit for no knockback. */
    knockbackTier?: number;
    /**
     * Per-hit rider fired only for units that actually took damage (post-block).
     * Use for bleed, bonus damage, charge-on-hit, etc.
     */
    onDamage?: (ctx: CastBehaviourTickContext, unit: Unit, amountDealt: number) => void;
    /** Impact effect type string (default: `'punch'`). */
    impactType?: string;

    // ---- Hitbox ----
    /**
     * Pass a pre-built HitboxSpec (e.g. from `meleeLineHitbox` or `perpendicularSwingHitbox`).
     * When omitted, the factory calls `meleeLineHitbox(range, thickness)` using the
     * `range` and `thickness` config fields.
     */
    hitbox?: HitboxSpec;
    /** Hitbox reach in px. Only used when `hitbox` is not provided. Default 30. */
    range?: number;
    /** Hitbox half-width in px. Only used when `hitbox` is not provided. Default 20. */
    thickness?: number;

    // ---- Animation ----
    /** Forward lunge in px during the active window (default 12). */
    forwardDistance?: number;
    /** Backward recoil in px after impact (default 0). */
    backwardDistance?: number;
    /**
     * Progress fraction [0, 1] within the active window at which impact fires (default 0.4).
     * 0 = fires on the very first tick, 1 = fires at window end.
     */
    impactAt?: number;
    /** Max simultaneous hits (default 1). Forwarded to `.withMaxHits()`. */
    maxHits?: number;

    // ---- Timings ----
    /** Duration of the windup phase in seconds (default 0.6). */
    windupDuration?: number;
    /** Duration of the active-hit window in seconds (default 0.1). */
    activeDuration?: number;
    /** Duration of the cooldown phase in seconds (default 0.9). */
    cooldownDuration?: number;

    // ---- Ability meta ----
    resourceCost?: AbilityStatic['resourceCost'];
    rechargeTurns?: number;
    maxUses?: number;
    recoveries?: readonly AbilityRecoveryRule[];
    targets?: AbilityStatic['targets'];
    /**
     * Declarative windup telegraph (shrinking circle).
     * Omit for no telegraph.
     */
    telegraph?: AbilityTelegraph;
    /**
     * `abilityTimings` interval id after which windup target-tracking (e.g. the telegraph aim)
     * freezes instead of continuing until `prefireTime`. See `AbilityStatic.trackTargetUntilLabel`.
     */
    trackTargetUntilLabel?: string;
    abilityEvents?: Partial<Record<AbilityEventType, readonly AbilityEventRule[]>>;

    // ---- Lock-on ----
    /**
     * Extra px beyond (caster.radius + target.radius) for guaranteed hits at impact time.
     * When omitted, uses the hitbox-derived default (hitboxMaxRange + 100px).
     */
    lockOnExtra?: number;
    /**
     * Extra px beyond (caster.radius + target.radius) at which the windup telegraph tether breaks.
     * When omitted, uses the hitbox-derived default (hitboxMaxRange + 100px).
     */
    maxLockOnExtra?: number;

    // ---- AI ----
    aiPriority?: number;
    /**
     * Override the auto-derived AI maxRange. When omitted the hitbox maxRange is used.
     * Useful for abilities whose effective threat range exceeds the hitbox (e.g. due to
     * unit radius padding not baked into the hitbox).
     */
    aiMaxRange?: number;
    /** Ninjutsu pool config. Use `{ ignore: true }` for boss abilities that bypass the pool. */
    aiNinjutsu?: AbilityNinjutsuConfig;

    // ---- Tooltip ----
    getTooltipText: (gameState?: unknown) => string[];

    // ---- Movement lock ----
    /**
     * Override the auto-derived movement lock boundary.
     * Default: `windupDuration + activeDuration` (lock through the active window,
     * release during cooldown).
     */
    movementLockUntil?: number;

    // ---- Windup lunge ----
    /**
     * Optional windup lunge. When set, the caster physically steps toward the target
     * during the windup phase by up to `lunge.distance` px.
     * `getRange.maxRange` is automatically extended by `lunge.distance`, so set
     * `aiMaxRange` to `hitboxMaxRange + lunge.distance` for correct AI behaviour.
     */
    lunge?: WindupLungeConfig;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function defineMeleeStrike(config: MeleeStrikeConfig): AbilityStatic {
    const windupDuration = config.windupDuration ?? 0.6;
    const activeDuration = config.activeDuration ?? 0.1;
    const cooldownDuration = config.cooldownDuration ?? 0.9;

    const windupEnd = windupDuration;
    const activeEnd = windupEnd + activeDuration;
    const totalDuration = activeEnd + cooldownDuration;

    const movementLockUntil = config.movementLockUntil ?? activeEnd;

    // Resolve hitbox: prefer explicit, fall back to meleeLineHitbox.
    const hitbox: HitboxSpec = config.hitbox ?? meleeLineHitbox(
        config.range ?? 30,
        config.thickness ?? 20,
    );

    // Build the attack behaviour.
    let behaviour = CastBehaviours.MeleeAttack()
        .withHitbox(hitbox)
        .withImpact(config.impactType ?? 'punch')
        .withImpactAt(config.impactAt ?? 0.4)
        .withSlide({
            forwardDistance: config.forwardDistance ?? 12,
            backwardDistance: config.backwardDistance ?? 0,
        })
        .withDamage(config.damage);

    if (config.knockbackTier !== undefined) {
        behaviour = behaviour.withKnockback(config.knockbackTier);
    }

    if (config.onDamage) {
        behaviour = behaviour.onDamage(config.onDamage);
    }

    if (config.maxHits !== undefined && config.maxHits > 1) {
        behaviour = behaviour.withMaxHits(config.maxHits);
    }

    if (config.lockOnExtra !== undefined) {
        behaviour = behaviour.withLockOnExtra(config.lockOnExtra);
    }

    // Build timing intervals.
    const ABILITY_TIMINGS: AbilityTimingInterval[] = [
        { id: 'windup',   start: 0,          end: windupEnd,   abilityPhase: AbilityPhase.Windup },
        { id: 'strike',   start: windupEnd,   end: activeEnd,   abilityPhase: AbilityPhase.Active,
          doNotRefund: true,
          targetDef: { kind: 'select', label: 'Target', hitbox, filter: 'enemy', allowMiss: true,
              ...(config.maxLockOnExtra !== undefined ? { maxLockOnExtra: config.maxLockOnExtra } : {}) },
          behaviour },
        { id: 'cooldown', start: activeEnd,   end: totalDuration, abilityPhase: AbilityPhase.Cooldown },
    ];

    // Build AI settings.
    const aiMaxRange = config.aiMaxRange ?? hitbox.maxRange;
    const aiSettings = {
        minRange: 0,
        maxRange: aiMaxRange,
        priority: config.aiPriority,
        ...(config.aiNinjutsu ? { ninjutsu: config.aiNinjutsu } : {}),
    };

    // Assemble the full input for defineAbility.
    const baseDamage = config.damage;
    const tooltipBindings: TooltipTokenBindings = {
        DAMAGE: { kind: 'damage', base: baseDamage },
    };
    const getDamage = (caster?: Unit): number =>
        getAbilityDamageForDisplay(baseDamage, caster ? { attacker: caster } : {});

    const defInput: AbilityDefInput = {
        id: config.id,
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        rechargeTurns: config.rechargeTurns ?? 0,
        maxUses: config.maxUses,
        recoveries: config.recoveries,
        prefireTime: windupEnd,
        targets: config.targets ?? [{ type: 'unit', label: 'Target' }],
        abilityTimings: ABILITY_TIMINGS,
        aiSettings,
        telegraph: config.telegraph
            ? { ...config.telegraph, trackTarget: config.telegraph.trackTarget ?? true }
            : undefined,
        trackTargetUntilLabel: config.trackTargetUntilLabel,
        abilityEvents: config.abilityEvents,
        movementLock: { until: movementLockUntil },
        getDamage,
        getTooltipText(gameState?: unknown): string[] {
            // Prefer explicit {{DAMAGE}}; also rewrite legacy `{base}` placeholders so
            // existing melee tooltips pick up the unified damage-modifier path.
            const templates = config.getTooltipText(gameState).map((line) =>
                line.includes('{{DAMAGE}}')
                    ? line
                    : line.split(`{${baseDamage}}`).join('{{DAMAGE}}'),
            );
            return formatTooltipLegacyLines(
                templates,
                tooltipBindings,
                resolveTooltipContext(gameState, { ability: { id: config.id } }),
            );
        },
        ...(config.lunge ? { lunge: config.lunge } : {}),
    };

    return defineAbility(defInput);
}
