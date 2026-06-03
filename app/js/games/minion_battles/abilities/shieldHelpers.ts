/**
 * Factory helpers for directional blocking (shield) abilities.
 * Use these to replace the copy-pasted getBlockingArc / renderActivePreview /
 * getAbilityStates boilerplate that every shield ability previously duplicated.
 */

import { AbilityState } from './Ability';
import type { AbilityStateEntry, AbilityStatic } from './Ability';
import { drawArcWedge } from './previewHelpers';
import { getDirectionFromTo } from './targetHelpers';

/** Default half-arc in radians: 60° → 120° total blocking arc. */
export const STANDARD_SHIELD_HALF_ARC_RAD = Math.PI / 3;

// ---- createDirectionalBlockingArc ----

export interface DirectionalBlockingArcOptions {
    /** Exclusive end of the blocking window (seconds from cast start). */
    blockDuration: number;
    /** Inclusive start of the blocking window. Default 0. */
    blockStart?: number;
    /** Half-arc in radians. Default STANDARD_SHIELD_HALF_ARC_RAD (60°, giving 120° total). */
    halfArcRad?: number;
    /** Which target index to read the aim direction from. Default 0. */
    targetIndex?: number;
}

/**
 * Factory returning a `getBlockingArc` implementation for directional shield abilities.
 * The arc is centered on the direction from caster to the target pixel.
 */
export function createDirectionalBlockingArc(
    options: DirectionalBlockingArcOptions,
): NonNullable<AbilityStatic['getBlockingArc']> {
    const {
        blockDuration,
        blockStart = 0,
        halfArcRad = STANDARD_SHIELD_HALF_ARC_RAD,
        targetIndex = 0,
    } = options;

    return (caster, activeAbility, currentTime) => {
        if (currentTime < blockStart || currentTime >= blockDuration) return null;
        const pos = activeAbility.targets[targetIndex]?.position;
        if (!pos) return null;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return null;
        const centerAngle = Math.atan2(dirY, dirX);
        return {
            arcStartAngle: centerAngle - halfArcRad,
            arcEndAngle: centerAngle + halfArcRad,
        };
    };
}

// ---- createShieldActivePreview ----

export interface ShieldActivePreviewOptions {
    /** Exclusive end of the blocking window (seconds). */
    blockDuration: number;
    /** Inclusive start of the blocking window. Default 0. */
    blockStart?: number;
    /** Half-arc in radians. Default STANDARD_SHIELD_HALF_ARC_RAD. */
    halfArcRad?: number;
    /** Pixels from caster.radius to the inner edge of the arc. Default 5. */
    innerOffset?: number;
    /** Thickness of the arc wedge in pixels. Default 10. */
    thicknessPx?: number;
    fillColor?: number;
    fillAlpha?: number;
    strokeColor?: number;
    strokeAlpha?: number;
    /** Number of arc segments for smoothness. Default 24. */
    segments?: number;
}

/**
 * Factory returning a `renderActivePreview` implementation that draws the shield arc
 * while the blocking window is active.
 */
export function createShieldActivePreview(
    options: ShieldActivePreviewOptions,
): NonNullable<AbilityStatic['renderActivePreview']> {
    const {
        blockDuration,
        blockStart = 0,
        halfArcRad = STANDARD_SHIELD_HALF_ARC_RAD,
        innerOffset = 5,
        thicknessPx = 10,
        fillColor,
        fillAlpha = 0.9,
        strokeColor,
        strokeAlpha = 0.9,
        segments = 24,
    } = options;

    return (gr, caster, activeAbility, gameTime) => {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed < blockStart || elapsed >= blockDuration) return;
        const pos = activeAbility.targets[0]?.position;
        if (!pos) return;
        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;
        const centerAngle = Math.atan2(dirY, dirX);
        drawArcWedge(
            gr,
            caster.x,
            caster.y,
            centerAngle,
            halfArcRad,
            caster.radius + innerOffset,
            caster.radius + thicknessPx,
            segments,
            { fillAlpha, strokeAlpha, ...(fillColor !== undefined ? { fillColor } : {}), ...(strokeColor !== undefined ? { strokeColor } : {}) },
        );
    };
}

// ---- createMovementPenaltyStates ----

/**
 * Factory returning a `getAbilityStates` implementation that applies a movement penalty
 * for the duration of the blocking window, then returns empty.
 */
export function createMovementPenaltyStates(
    amount: number,
    blockDuration: number,
): AbilityStatic['getAbilityStates'] {
    const penaltyStates: AbilityStateEntry[] = [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount } }];
    return (currentTime) => (currentTime < blockDuration ? penaltyStates : []);
}
