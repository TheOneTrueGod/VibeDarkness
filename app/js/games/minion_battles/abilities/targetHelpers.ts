/**
 * Shared helpers for resolving and testing targets in abilities.
 * Use these so ability files stay minimal and read like a list of behaviours.
 */

import type { ResolvedTarget } from '../game/types';

/** Get pixel target position from resolved targets, or null if missing/invalid. */
export function getPixelTargetPosition(
    targets: ResolvedTarget[],
    index: number = 0,
): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

/** Direction and distance from one point to another. */
export interface DirectionFromTo {
    dirX: number;
    dirY: number;
    dist: number;
}

/** Normalized direction from (fromX, fromY) to (toX, toY). dist is 0 if points are equal. */
export function getDirectionFromTo(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
): DirectionFromTo {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0 ? dx / dist : 1;
    const dirY = dist > 0 ? dy / dist : 0;
    return { dirX, dirY, dist };
}

/** Point at max range from caster toward target (for line abilities that cap at max range). */
export function getAimPointClampedToMaxRange(
    caster: { x: number; y: number },
    target: { x: number; y: number },
    maxR: number,
): { x: number; y: number } {
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
    return {
        x: caster.x + dirX * maxR,
        y: caster.y + dirY * maxR,
    };
}

/**
 * True if point (ux, uy) is inside the cone from (casterX, casterY) toward (dirX, dirY),
 * within [minR, maxR] and within halfAngleRad of the direction.
 */
export function pointInCone(
    casterX: number,
    casterY: number,
    ux: number,
    uy: number,
    dirX: number,
    dirY: number,
    minR: number,
    maxR: number,
    halfAngleRad: number,
): boolean {
    const vx = ux - casterX;
    const vy = uy - casterY;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < minR || dist > maxR) return false;
    if (dist === 0) return false;
    const nx = vx / dist;
    const ny = vy / dist;
    const dDot = dirX * nx + dirY * ny;
    return dDot >= Math.cos(halfAngleRad);
}
