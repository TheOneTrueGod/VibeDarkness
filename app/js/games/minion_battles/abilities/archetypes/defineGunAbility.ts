/**
 * defineGunAbility — archetype factory for projectile gun abilities.
 *
 * Produces a full `AbilityStatic` from a compact config, eliminating the
 * repeated wiring of fireGunShotAtTarget + doCardEffect tick gates that
 * every gun ability duplicates.
 *
 * Capabilities:
 *  - Supports single-shot-burst (Pistol: numShots=3, perShotTargets=true),
 *    spray (SMG: numShots=8, single target), and pellet-blast (Shotgun:
 *    numShots=1, pelletsPerShot=6) patterns from one config.
 *  - Shots fire via a sustained CastBehaviour on the spray timing window
 *    (progress-fraction tick-crossing), replacing doCardEffect gates.
 *  - deactivateProjectileOnBlock wired automatically.
 *  - Cone targeting preview from createConeTargetPreviewWithDistanceInaccuracy.
 *  - Optional per-shot target lines (renderTargetingPreviewSelectedTargets)
 *    when perShotTargets is true.
 *
 * Timing:
 *  - cooldownDuration = seconds from the LAST shot to ability end.
 *  - Total duration = prefireTime + (numShots-1)*shotSpacing + SHOT_INTERVAL_WIDTH + cooldownDuration.
 *  - Absolute shot-fire times are exactly `prefireTime + i*shotSpacing` regardless of
 *    SHOT_INTERVAL_WIDTH — the width cancels out of the progress-fraction math (fraction =
 *    i*shotSpacing/windowLength, firedAt = start + fraction*windowLength). SHOT_INTERVAL_WIDTH
 *    only needs to be wide enough that the fixed-tick simulation can't step clean over the
 *    window: the engine samples ability-timing intervals once per fixed tick (60 Hz, ~16.7ms)
 *    via point-containment, not range overlap, so a window narrower than one tick can be
 *    entered and exited between two consecutive ticks and never get sampled at all — this is
 *    fatal for single-shot guns (numShots=1, e.g. Shotgun), where naturalSprayWidth is 0 and
 *    the window IS SHOT_INTERVAL_WIDTH. Keep this comfortably above one tick.
 */

import type {
    AbilityRecoveryRule,
    AbilityStatic,
    AttackBlockedInfo,
    IAbilityPreviewGraphics,
} from '../Ability';
import type { TargetDef } from '../targeting';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import type {
    CastBehaviour,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';
import { AbilityPhase } from '../abilityTimings';
import type { AbilityTimingInterval } from '../abilityTimings';
import {
    fireGunShotAtTarget,
    getRandomSpeedFactor,
} from '../gunHelpers';
import { deactivateProjectileOnBlock } from '../effectHelpers';
import {
    createConeTargetPreviewWithDistanceInaccuracy,
    drawClampedLine,
} from '../previewHelpers';
import { getPixelTargetPosition } from '../targetHelpers';

// Spray window padding. Must exceed one fixed simulation tick (1/60s ≈ 0.0167s) with margin,
// or the ability-timing sampler can step clean over the window without ever entering it —
// see the class doc comment above. 0.05s is ~3 ticks of margin.
const SHOT_INTERVAL_WIDTH = 0.05;

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface GunAbilityConfig {
    // ---- Identity ----
    id: string;
    name: string;
    image: string;

    // ---- Combat numbers ----
    damage: number;
    maxDistance: number;
    /** Projectile speed in px/s. Default: 1400. */
    bulletSpeed?: number;
    /** Base inaccuracy half-angle in radians. */
    baseInaccuracy: number;

    // ---- Shot pattern ----
    /** Number of firing events. Default: 1. */
    numShots?: number;
    /** Seconds between consecutive firing events. Default: 0 (all fire together). */
    shotSpacing?: number;
    /** Projectiles spawned per firing event. Default: 1. */
    pelletsPerShot?: number;
    /**
     * Speed multiplier range for pellet spread (e.g. { min: 0.9, max: 1.1 }).
     * When set, each pellet gets a random speed in speed × [min, max].
     * Requires engine.generateRandomInteger.
     */
    pelletSpeedVariation?: { min: number; max: number };
    /**
     * When true, shot i uses allTargets[i] as its pixel aim point (Pistol style).
     * Default false: all shots aim at allTargets[0].
     */
    perShotTargets?: boolean;

    // ---- Target labels ----
    /** Label for the single target when perShotTargets is false. Default: 'Direction'. */
    targetLabel?: string;
    /**
     * Labels for per-shot targets when perShotTargets is true.
     * Default: ['Shot 1', 'Shot 2', ...].
     */
    targetLabels?: string[];

    // ---- Timings ----
    /** Windup duration before the first shot fires (seconds). */
    prefireTime: number;
    /** Recovery time after the last shot to ability end (seconds). */
    cooldownDuration: number;

    // ---- Ability meta ----
    resourceCost?: AbilityStatic['resourceCost'];
    resourceCosts?: AbilityStatic['resourceCosts'];
    rechargeTurns?: number;
    maxUses?: number;
    recoveries?: readonly AbilityRecoveryRule[];
    damageModifierMultiplier?: number;

    // ---- Tooltip ----
    getTooltipText: () => string[];
}

// ---------------------------------------------------------------------------
// Internal: gun shot CastBehaviour
// ---------------------------------------------------------------------------

function buildGunBehaviour(options: {
    shotProgressFractions: number[];
    pelletsPerShot: number;
    pelletSpeedVariation?: { min: number; max: number };
    damage: number;
    maxDistance: number;
    speed: number;
    baseInaccuracy: number;
    perShotTargets: boolean;
    abilityId: string;
}): CastBehaviour {
    const {
        shotProgressFractions,
        pelletsPerShot,
        pelletSpeedVariation,
        damage,
        maxDistance,
        speed,
        baseInaccuracy,
        perShotTargets,
        abilityId,
    } = options;

    return {
        onTick(ctx: CastBehaviourTickContext): void {
            for (let i = 0; i < shotProgressFractions.length; i++) {
                const fireAt = shotProgressFractions[i]!;
                // fireAt=0 special-case: use isFirstTick to avoid the 0<0=false edge case.
                const crossed =
                    fireAt <= 0
                        ? ctx.isFirstTick
                        : ctx.prevWindowProgress < fireAt && ctx.windowProgress >= fireAt;
                if (!crossed) continue;

                const targetIdx = perShotTargets ? i : 0;
                const pos = getPixelTargetPosition(ctx.allTargets, targetIdx);
                if (!pos) continue;

                for (let p = 0; p < pelletsPerShot; p++) {
                    const shotSpeed = pelletSpeedVariation
                        ? speed * getRandomSpeedFactor(
                            ctx.engine,
                            pelletSpeedVariation.min,
                            pelletSpeedVariation.max,
                        )
                        : speed;
                    fireGunShotAtTarget({
                        engine: ctx.engine,
                        caster: ctx.caster,
                        targetX: pos.x,
                        targetY: pos.y,
                        damage,
                        maxDistance,
                        speed: shotSpeed,
                        abilityId,
                        baseInaccuracy,
                    });
                }
            }
        },
    };
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function defineGunAbility(config: GunAbilityConfig): AbilityStatic {
    const numShots = config.numShots ?? 1;
    const shotSpacing = config.shotSpacing ?? 0;
    const pelletsPerShot = config.pelletsPerShot ?? 1;
    const speed = config.bulletSpeed ?? 1400;
    const perShotTargets = config.perShotTargets ?? false;

    // Spray window: [prefireTime, prefireTime + naturalWidth + SHOT_INTERVAL_WIDTH)
    // naturalWidth = (numShots-1)*shotSpacing; SHOT_INTERVAL_WIDTH makes start<end valid.
    const naturalSprayWidth = (numShots - 1) * shotSpacing;
    const sprayWindowLength = naturalSprayWidth + SHOT_INTERVAL_WIDTH;
    const sprayStart = config.prefireTime;
    const sprayEnd = sprayStart + sprayWindowLength;
    const totalDuration = sprayEnd + config.cooldownDuration;

    // Progress fractions [0,1] within the spray window at which each shot fires.
    // Shot i fires at (i * shotSpacing) / sprayWindowLength — nearly evenly spaced;
    // the SHOT_INTERVAL_WIDTH tail shifts each fraction < 1 by ~1ms, negligible.
    const shotProgressFractions = Array.from({ length: numShots }, (_, i) =>
        numShots === 1 ? 0 : (i * shotSpacing) / sprayWindowLength,
    );

    const behaviour = buildGunBehaviour({
        shotProgressFractions,
        pelletsPerShot,
        pelletSpeedVariation: config.pelletSpeedVariation,
        damage: config.damage,
        maxDistance: config.maxDistance,
        speed,
        baseInaccuracy: config.baseInaccuracy,
        perShotTargets,
        abilityId: config.id,
    });

    // Timing intervals
    const abilityTimings: AbilityTimingInterval[] = [];
    if (sprayStart > 0) {
        abilityTimings.push({
            id: 'windup',
            start: 0,
            end: sprayStart,
            abilityPhase: AbilityPhase.Windup,
        });
    }
    abilityTimings.push({
        id: 'spray',
        start: sprayStart,
        end: sprayEnd,
        abilityPhase: AbilityPhase.Active,
        doNotRefund: true,
        behaviour,
    });
    if (config.cooldownDuration > 0) {
        abilityTimings.push({
            id: 'cooldown',
            start: sprayEnd,
            end: totalDuration,
            abilityPhase: AbilityPhase.Cooldown,
        });
    }

    // Targets
    const targets: TargetDef[] = perShotTargets
        ? Array.from({ length: numShots }, (_, i) => ({
            type: 'pixel' as const,
            label: config.targetLabels?.[i] ?? `Shot ${i + 1}`,
        }))
        : [{ type: 'pixel' as const, label: config.targetLabel ?? 'Direction' }];

    // Per-shot committed-target lines (shown while the player is aiming subsequent shots).
    const renderTargetingPreviewSelectedTargets: AbilityStatic['renderTargetingPreviewSelectedTargets'] =
        perShotTargets
            ? (
                gr: IAbilityPreviewGraphics,
                caster: Unit,
                currentTargets: ResolvedTarget[],
            ): void => {
                for (let i = 0; i < currentTargets.length; i++) {
                    const pos = getPixelTargetPosition(currentTargets, i);
                    if (pos) drawClampedLine(gr, caster, pos, config.maxDistance);
                }
            }
            : undefined;

    return {
        id: config.id,
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        resourceCosts: config.resourceCosts,
        rechargeTurns: config.rechargeTurns ?? 0,
        maxUses: config.maxUses,
        recoveries: config.recoveries,
        damageModifierMultiplier: config.damageModifierMultiplier,
        prefireTime: config.prefireTime,
        targets,
        abilityTimings,
        aiSettings: { minRange: 0, maxRange: config.maxDistance },
        getTooltipText: config.getTooltipText,
        getRange: (_caster: Unit) => ({ minRange: 0, maxRange: config.maxDistance }),
        getAbilityStates: (_currentTime: number) => [],
        onAttackBlocked: (_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void => {
            deactivateProjectileOnBlock(attackInfo);
        },
        renderTargetingPreview: createConeTargetPreviewWithDistanceInaccuracy(
            config.maxDistance,
            config.baseInaccuracy,
        ),
        renderTargetingPreviewSelectedTargets,
    };
}
