/**
 * Projectile rings: `count` projectiles fired outward in evenly spaced directions from one point
 * (Light Eater's blast, Shard Nova from every crystal). The caller supplies the spawn function, so
 * any projectile type, speed or theme can ring. Directions are deterministic (no RNG).
 */

export interface ProjectileRingSpec {
    count: number;
    /** Angle (radians) of the first projectile; 0 = east. */
    rotation?: number;
}

/** Unit direction vectors of a ring, first at `rotation`, then clockwise on screen. */
export function projectileRingDirections(spec: ProjectileRingSpec): { x: number; y: number }[] {
    if (spec.count <= 0) return [];
    const step = (Math.PI * 2) / spec.count;
    const base = spec.rotation ?? 0;
    return Array.from({ length: spec.count }, (_, i) => ({
        x: Math.cos(base + i * step),
        y: Math.sin(base + i * step),
    }));
}

/** Call `spawn(dirX, dirY, index)` once per ring direction. Returns what `spawn` returned. */
export function fireProjectileRing<T>(
    spec: ProjectileRingSpec,
    spawn: (dirX: number, dirY: number, index: number) => T,
): T[] {
    return projectileRingDirections(spec).map((d, i) => spawn(d.x, d.y, i));
}
