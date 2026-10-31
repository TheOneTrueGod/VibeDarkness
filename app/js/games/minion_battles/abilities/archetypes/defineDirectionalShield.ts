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
 *  - Optional `blockBehaviour` on the block window and a `beginActiveCast` hook.
 *  - Forwards abilityEvents, customEffectHandlers, and all standard AbilityStatic meta.
 *  - Defaults: movementPenalty=0.1, arcDeg=120, innerOffset=5, thicknessPx=10,
 *    fillAlpha=0.9, strokeAlpha=0.9, minRange=10, maxRange=300.
 *  - Colours: omitted `fillColor` / `strokeColor` take the ability's two-tone theme
 *    (fill = primary, stroke = secondary); otherwise the shield helpers' own defaults.
 */

import type { AbilityRecoveryRule, AbilityStatic } from '../Ability';
import { AbilityPhase } from '../abilityTimings';
import type { AbilityTimingInterval } from '../abilityTimings';
import type { CastBehaviour } from '../castBehaviourTypes';
import { createArcTargetPreview } from '../previewHelpers';
import { nullHitbox } from '../../hitboxes';
import {
    createDirectionalBlockingArc,
    createMovementPenaltyStates,
    createShieldActivePreview,
    DIRECTIONAL_SHIELD_AIM_RANGE,
    DIRECTIONAL_SHIELD_MOVEMENT_PENALTY,
    STANDARD_SHIELD_ARC_DEGREES,
    STANDARD_SHIELD_INNER_OFFSET,
    STANDARD_SHIELD_THICKNESS_PX,
} from '../shieldHelpers';
import { getTwoToneAbilityTheme } from '../../themes/abilityTheme';

// ---------------------------------------------------------------------------
// Config interface
// ---------------------------------------------------------------------------

export interface DirectionalShieldConfig {
    // ---- Identity ----
    id: string;
    name: string;
    image: string;
    tags?: AbilityStatic['tags'];

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
    /** Runs on the block window, e.g. `CastBehaviours.Instant(fn, { at: 'end' })` to act once it closes. */
    blockBehaviour?: CastBehaviour;
    /** Label of the aim pick (default: 'Direction to block'). */
    aimLabel?: string;

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
    /** Default: the theme primary when the ability's group has a two-tone theme, else the helper default. */
    fillColor?: number;
    fillAlpha?: number;
    /** Default: the theme secondary when the ability's group has a two-tone theme, else the helper default. */
    strokeColor?: number;
    strokeAlpha?: number;

    // ---- AI ----
    minRange?: number;
    maxRange?: number;

    // ---- Hooks ----
    /** Called when the cast starts, before the block window opens. */
    beginActiveCast?: AbilityStatic['beginActiveCast'];

    // ---- Events ----
    abilityEvents?: AbilityStatic['abilityEvents'];
    customEffectHandlers?: AbilityStatic['customEffectHandlers'];

    // ---- Tooltip ----
    getTooltipText: (gameState?: unknown) => string[];
    /** Card flavour line; see `AbilityStatic.flavorText`. */
    flavorText?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_AIM_LABEL = 'Direction to block';

/**
 * Fill and stroke the shield will draw with. Explicit config colours win; omitted ones come from the
 * ability's two-tone theme. A key left out means the shield helpers' own default.
 */
export function resolveDirectionalShieldColors(
    config: Pick<DirectionalShieldConfig, 'id' | 'fillColor' | 'strokeColor'>,
): { fillColor?: number; strokeColor?: number } {
    const theme = getTwoToneAbilityTheme(config.id);
    const fillColor = config.fillColor ?? theme?.primaryNum;
    const strokeColor = config.strokeColor ?? theme?.secondaryNum;
    return {
        ...(fillColor !== undefined ? { fillColor } : {}),
        ...(strokeColor !== undefined ? { strokeColor } : {}),
    };
}

export function defineDirectionalShield(config: DirectionalShieldConfig): AbilityStatic {
    const duration = config.duration;
    const cooldownDuration = config.cooldownDuration ?? 0;
    const movementPenalty = config.movementPenalty ?? DIRECTIONAL_SHIELD_MOVEMENT_PENALTY;
    const arcDeg = config.arcDeg ?? STANDARD_SHIELD_ARC_DEGREES;
    const halfArcRad = (arcDeg * Math.PI) / 180 / 2;
    const innerOffset = config.innerOffset ?? STANDARD_SHIELD_INNER_OFFSET;
    const thicknessPx = config.thicknessPx ?? STANDARD_SHIELD_THICKNESS_PX;
    const fillAlpha = config.fillAlpha ?? 0.9;
    const strokeAlpha = config.strokeAlpha ?? 0.9;

    const abilityTimings: AbilityTimingInterval[] = [
        {
            id: 'juggernaut',
            start: 0,
            end: duration,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: config.aimLabel ?? DEFAULT_AIM_LABEL,
                hitbox: nullHitbox,
                filter: 'any',
                allowMiss: true,
            },
            ...(config.blockBehaviour ? { behaviour: config.blockBehaviour } : {}),
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

    const colorOverrides = resolveDirectionalShieldColors(config);

    const ability: AbilityStatic = {
        id: config.id,
        name: config.name,
        image: config.image,
        ...(config.tags !== undefined ? { tags: config.tags } : {}),
        resourceCost: config.resourceCost ?? null,
        rechargeTurns: config.rechargeTurns ?? 0,
        maxUses: config.maxUses,
        recoveries: config.recoveries,
        prefireTime: duration,
        targets: [],
        aiSettings: { minRange: config.minRange ?? 10, maxRange: config.maxRange ?? DIRECTIONAL_SHIELD_AIM_RANGE },
        abilityTimings,

        getTooltipText: config.getTooltipText,
        flavorText: config.flavorText,

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

        ...(config.beginActiveCast !== undefined ? { beginActiveCast: config.beginActiveCast } : {}),

        ...(config.abilityEvents !== undefined ? { abilityEvents: config.abilityEvents } : {}),
        ...(config.customEffectHandlers !== undefined ? { customEffectHandlers: config.customEffectHandlers } : {}),
    };

    return ability;
}
