/**
 * Render rules for team perception (`game/visibility/teamPerception.ts`): how translucent an enemy is,
 * how much the darkness overlay lifts on tiles inside the team's vision, and which effects hide with
 * their owner. Pure, so the Pixi renderers stay thin and these numbers can be tuned in one place.
 */

import { darknessVisionCost, type Detection } from '../../visibility/senses';

/** Container alpha of a seen enemy standing in full darkness (1 when lit; follows `darknessVisionCost`). */
export const ENEMY_DARK_MIN_ALPHA = 0.45;

/** Container alpha of a glimpsed enemy (lit, beyond vision range). */
export const GLIMPSED_ENEMY_ALPHA = 0.45;

/** Darkness overlay alpha cap on tiles inside the team's vision, so dark terrain in sight shows faintly. */
export const VISIBLE_DARK_TILE_MAX_ALPHA = 0.85;

/**
 * Alpha of a seen enemy on a tile with `lightLevel`: 1 when lit, down to {@link ENEMY_DARK_MIN_ALPHA} in
 * full darkness, on the same curve as `darknessVisionCost`. `null` (no light data / perception off) is 1.
 */
export function enemyDarknessAlpha(lightLevel: number | null): number {
    if (lightLevel === null) return 1;
    return 1 - (1 - ENEMY_DARK_MIN_ALPHA) * darknessVisionCost(lightLevel);
}

/**
 * Container alpha for an enemy unit by detection tier. Seen enemies fade with darkness, glimpsed ones
 * use {@link GLIMPSED_ENEMY_ALPHA}, and invisible tiers (heard, felt, hidden) are 0: the body is not drawn.
 * Friendly units are not passed through this; they stay at full alpha.
 */
export function enemyUnitAlpha(detection: Detection, lightLevel: number | null): number {
    switch (detection) {
        case 'seen':
            return enemyDarknessAlpha(lightLevel);
        case 'glimpsed':
            return GLIMPSED_ENEMY_ALPHA;
        default:
            return 0;
    }
}

/** Darkness overlay alpha for one tile: `baseAlpha`, capped at {@link VISIBLE_DARK_TILE_MAX_ALPHA} inside vision. */
export function darknessOverlayTileAlpha(baseAlpha: number, inVision: boolean): number {
    return inVision ? Math.min(baseAlpha, VISIBLE_DARK_TILE_MAX_ALPHA) : baseAlpha;
}

/** The effect fields {@link isEffectConcealed} reads. */
export interface ConcealableEffect {
    readonly concealedWithOwner?: boolean;
    readonly ownerActorId?: string;
}

/**
 * True when the effect should not be drawn because it hides with its owner (`concealedWithOwner`) and the
 * owner is invisible to the local team. Effects without an owner, or that don't opt in, are never concealed.
 */
export function isEffectConcealed(
    effect: ConcealableEffect,
    isActorVisible: ((actorId: string) => boolean) | undefined,
): boolean {
    if (!effect.concealedWithOwner || !effect.ownerActorId || !isActorVisible) return false;
    return !isActorVisible(effect.ownerActorId);
}
