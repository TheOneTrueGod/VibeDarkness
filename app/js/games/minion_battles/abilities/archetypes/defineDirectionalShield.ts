/**
 * defineDirectionalShield — archetype factory for directional blocking abilities.
 *
 * Produces a full `AbilityStatic` from a compact config object, eliminating the
 * repeated wiring of createDirectionalBlockingArc + createShieldActivePreview +
 * createMovementPenaltyStates + createArcTargetPreview that every shield duplicates.
 *
 * Capabilities:
 *  - Auto-generates timing intervals (active-block / optional cooldown) from durations.
 *  - Wires getBlockingArc, renderActivePreview, renderTargetingPreview, getAbilityStates
 *    declaratively from config.
 *  - Forwards abilityEvents, customEffectHandlers, and all standard AbilityStatic meta.
 *  - Defaults: movementPenalty=0.1, arcDeg=120, innerOffset=5, thicknessPx=10,
 *    fillAlpha=0.9, strokeAlpha=0.9, minRange=10, maxRange=300.
 */

import type { AbilityRecoveryRule, AbilityStatic } from '../Ability';
import { AbilityPhase } from '../abilityTimings';
import type { AbilityTimingInterval } from '../abilityTimings';
import { createArcTargetPreview } from '../previewHelpers';
import { nullHitbox } from '../../hitboxes';
import {
    createDirectionalBlockingArc,
    createMovementPenaltyStates,
    createShieldActivePreview,
} from '../shieldHelpers';

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface DirectionalShieldConfig {
    // ---- Identity ----
    id: string;
    name: string;
    image: string;

    // ---- Ability meta ----
    resourceCost?: AbilityStatic['resourceCost'];
    rechargeTurns?: number;
    maxUses?: number;
    recoveries?: readonly AbilityRecoveryRule[];

    // ---- Timings ----
    /** Duration of the active blocking window in seconds. */
    duration: number;
    /** Duration of the cooldown phase after the block window (default: 0 = no cooldown). */
    cooldownDuration?: number;

    // ---- Movement ----
    /** Movement speed reduction while blocking (default: 0.1). */
    movementPenalty?: number;

    // ---- Visual ----
    /** Full blocking arc in degrees (default: 120). */
    arcDeg?: number;
    /** Pixels from caster.radius to the inner edge of the arc (default: 5). */
    innerOffset?: number;
    /** Arc wedge thickness in pixels (default: 10). */
    thicknessPx?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeAlpha?: number;

    // ---- AI ----
    minRange?: number;
    maxRange?: number;

    // ---- Events ----
    abilityEvents?: AbilityStatic['abilityEvents'];
    customEffectHandlers?: AbilityStatic['customEffectHandlers'];

    // ---- Tooltip ----
    getTooltipText: (gameState?: unknown) => string[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function defineDirectionalShield(config: DirectionalShieldConfig): AbilityStatic {
    const duration = config.duration;
    const cooldownDuration = config.cooldownDuration ?? 0;
    const movementPenalty = config.movementPenalty ?? 0.1;
    const arcDeg = config.arcDeg ?? 120;
    const halfArcRad = (arcDeg * Math.PI) / 180 / 2;
    const innerOffset = config.innerOffset ?? 5;
    const thicknessPx = config.thicknessPx ?? 10;
    const fillAlpha = config.fillAlpha ?? 0.9;
    const strokeAlpha = config.strokeAlpha ?? 0.9;

    const abilityTimings: AbilityTimingInterval[] = [
        {
            id: 'juggernaut',
            start: 0,
            end: duration,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: { kind: 'select', label: 'Direction to block', hitbox: nullHitbox, filter: 'any', allowMiss: true },
        },
    ];
    if (cooldownDuration > 0) {
        abilityTimings.push({
            id: 'cooldown',
            start: duration,
            end: duration + cooldownDuration,
            abilityPhase: AbilityPhase.Cooldown,
        });
    }

    const colorOverrides = {
        ...(config.fillColor !== undefined ? { fillColor: config.fillColor } : {}),
        ...(config.strokeColor !== undefined ? { strokeColor: config.strokeColor } : {}),
    };

    const ability: AbilityStatic = {
        id: config.id,
        name: config.name,
        image: config.image,
        resourceCost: config.resourceCost ?? null,
        rechargeTurns: config.rechargeTurns ?? 0,
        maxUses: config.maxUses,
        recoveries: config.recoveries,
        prefireTime: duration,
        targets: [],
        aiSettings: { minRange: config.minRange ?? 10, maxRange: config.maxRange ?? 300 },
        abilityTimings,

        getTooltipText: config.getTooltipText,

        getAbilityStates: createMovementPenaltyStates(movementPenalty, duration),

        getBlockingArc: createDirectionalBlockingArc({ blockDuration: duration, halfArcRad }),

        renderActivePreview: createShieldActivePreview({
            blockDuration: duration,
            halfArcRad,
            innerOffset,
            thicknessPx,
            fillAlpha,
            strokeAlpha,
            ...colorOverrides,
        }),

        renderTargetingPreviewSelectedTargets: createArcTargetPreview({
            arcDeg,
            innerOffset,
            outerThickness: thicknessPx,
            fillAlpha,
            strokeAlpha,
            ...colorOverrides,
        }),

        onAttackBlocked(): void {},

        ...(config.abilityEvents !== undefined ? { abilityEvents: config.abilityEvents } : {}),
        ...(config.customEffectHandlers !== undefined ? { customEffectHandlers: config.customEffectHandlers } : {}),
    };

    return ability;
}
