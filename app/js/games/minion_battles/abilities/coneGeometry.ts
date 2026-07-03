/**
 * Pure geometry helpers for cone hit tests (no ability/engine imports).
 */

/** True if (ux, uy) lies in the cone from (casterX, casterY) along (dirX, dirY) within [minR, maxR]. */
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
