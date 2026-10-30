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

/**
 * True when a circle overlaps the cone sector. A center inside the cone counts, and so does a
 * body that only crosses the edge or the far arc.
 */
export function circleOverlapsCone(
    originX: number,
    originY: number,
    cx: number,
    cy: number,
    radius: number,
    dirX: number,
    dirY: number,
    minR: number,
    maxR: number,
    halfAngleRad: number,
): boolean {
    if (pointInCone(originX, originY, cx, cy, dirX, dirY, minR, maxR, halfAngleRad)) return true;
    const vx = cx - originX;
    const vy = cy - originY;
    const dist = Math.hypot(vx, vy);
    const reach = Math.max(0, radius);
    if (dist > maxR + reach) return false;
    if (dist + reach < minR) return false;
    if (dist <= 1e-6) return reach >= minR;
    const nx = vx / dist;
    const ny = vy / dist;
    const dot = dirX * nx + dirY * ny;
    const pad = Math.atan2(reach, dist);
    if (dot < Math.cos(Math.min(Math.PI, halfAngleRad + pad))) return false;
    return dist - reach <= maxR;
}
