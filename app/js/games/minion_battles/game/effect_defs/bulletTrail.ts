/** Width of a normal bullet-trail segment, in pixels. */
export const DEFAULT_BULLET_TRAIL_RADIUS = 3;
/** Gray used when a trail does not name its own colour. */
export const BULLET_TRAIL_COLOR = 0xb0b0b0;
/** Width of a tapered trail at the leading tip. */
export const BULLET_TRAIL_POINT_RADIUS = 0.35;

/**
 * Radius of a trail segment spawned at `progress` along the flight (0 at the start, 1 at max range).
 * A taper stays thick at the back and comes to a point at the projectile.
 */
export function bulletTrailSpawnRadius(base: number, progress: number, taper: boolean): number {
    if (!taper) return base;
    const clamped = Math.min(1, Math.max(0, progress));
    return Math.max(BULLET_TRAIL_POINT_RADIUS, base * (1 - clamped));
}
