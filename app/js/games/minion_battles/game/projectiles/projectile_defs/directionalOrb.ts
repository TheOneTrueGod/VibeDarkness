/**
 * Shared look for the Displacer / slime "orb" projectiles: slightly translucent, with a smaller,
 * fainter circle trailing off the rear edge so the direction of travel is easy to read.
 * Spread into a `SpriteProjectileConfig`.
 */

import type { DirectionBlobDef } from './types';

export const ORB_SPRITE_ALPHA = 0.85;

export const ORB_DIRECTION_BLOB: DirectionBlobDef = {
    scale: 0.5,
    alpha: 0.5,
    edgeFraction: 0.8,
    followRate: 9,
};

export const DIRECTIONAL_ORB_LOOK = {
    spriteAlpha: ORB_SPRITE_ALPHA,
    directionBlob: ORB_DIRECTION_BLOB,
} as const;

export interface TrailBlobState {
    /** World position of the blob centre. */
    x: number;
    y: number;
}

/**
 * Ease the blob toward its target (the point on the main sprite's rear edge) by `dt` seconds.
 * Frame-rate independent exponential follow; pure so it can be unit tested.
 */
export function stepTrailBlob(
    state: TrailBlobState,
    targetX: number,
    targetY: number,
    dt: number,
    followRate: number,
): void {
    const k = 1 - Math.exp(-followRate * Math.max(0, dt));
    state.x += (targetX - state.x) * k;
    state.y += (targetY - state.y) * k;
}
