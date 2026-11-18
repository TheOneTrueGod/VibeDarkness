/**
 * Drawing for anything travelling underground: the churned-earth trail behind it and the heaped mound on its heels.
 * Shared by burrowing units (`UnitGroundMarkRenderer`) and burrowing projectiles (`burrowingProjectileDef`), so a
 * seed growing out from a node looks like the Heart moving under the garden. Pure drawing on a caller's Graphics.
 */

import type { Graphics } from 'pixi.js';

const TRAIL_MOUND_COUNT = 5;
/** Spacing of the dirt clumps along a trail, in `size` units. */
const TRAIL_MOUND_SPACING = 0.7;

/** A faint run of churned earth from (fromX, fromY) to (toX, toY). `size` is the burrower's radius. */
export function drawBurrowTrail(
    g: Graphics,
    from: { x: number; y: number },
    to: { x: number; y: number },
    size: number,
    dirtColor: number,
    alpha: number,
): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len <= 1) return;
    const count = Math.floor(len / (size * TRAIL_MOUND_SPACING * 2));
    for (let i = 1; i < count; i++) {
        const t = i / count;
        g.ellipse(from.x + dx * t, from.y + dy * t + size * 0.6, size * 0.32, size * 0.14);
        g.fill({ color: dirtColor, alpha });
    }
}

/** Heaped earth at (x, y) on the burrower's heels, fading back along (dirX, dirY) (a unit vector, or 0,0). */
export function drawBurrowMound(
    g: Graphics,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    size: number,
    dirtColor: number,
): void {
    for (let k = 0; k < TRAIL_MOUND_COUNT; k++) {
        const back = k * size * TRAIL_MOUND_SPACING * 0.6;
        g.ellipse(x - dirX * back, y - dirY * back + size * 0.6, size * (0.6 - k * 0.07), size * (0.26 - k * 0.03));
        g.fill({ color: dirtColor, alpha: 0.9 - k * 0.15 });
    }
}
