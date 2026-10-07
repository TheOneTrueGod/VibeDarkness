/**
 * Clone placement for Phantom Decoy: pure, RNG-injected position picking so it can be unit tested
 * and replayed identically on every client (callers pass the engine's synced RNG).
 */

import {
    PHANTOM_DECOY_CLONE_COUNT,
    PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET,
    PHANTOM_DECOY_MIN_SPACING,
    PHANTOM_DECOY_PLACEMENT_ATTEMPTS,
    PHANTOM_DECOY_SPAWN_RADIUS,
} from './displacerConstants';

export interface ClonePlacementOptions {
    count?: number;
    radius?: number;
    minDistanceFromCenter?: number;
    minSpacing?: number;
    attempts?: number;
    /** True when a clone may stand at this world position (passable terrain, not blocked). */
    isFree: (x: number, y: number) => boolean;
    /** Positions of other units to stay clear of (same `minSpacing`). */
    occupied?: readonly { x: number; y: number }[];
    /** Synced integer RNG, inclusive bounds. */
    randomInt: (min: number, max: number) => number;
}

/**
 * Pick up to `count` positions in the annulus [minDistanceFromCenter, radius] around `center`,
 * skipping impassable spots and anything closer than `minSpacing` to another pick or occupant.
 * Returns fewer than `count` positions when the area is too cramped.
 */
export function pickCloneSpawnPositions(
    center: { x: number; y: number },
    opts: ClonePlacementOptions,
): { x: number; y: number }[] {
    const count = opts.count ?? PHANTOM_DECOY_CLONE_COUNT;
    const radius = opts.radius ?? PHANTOM_DECOY_SPAWN_RADIUS;
    const minFromCenter = opts.minDistanceFromCenter ?? PHANTOM_DECOY_MIN_DISTANCE_FROM_TARGET;
    const minSpacing = opts.minSpacing ?? PHANTOM_DECOY_MIN_SPACING;
    const attempts = opts.attempts ?? PHANTOM_DECOY_PLACEMENT_ATTEMPTS;

    const picked: { x: number; y: number }[] = [];
    const blockers: { x: number; y: number }[] = [...(opts.occupied ?? [])];

    for (let n = 0; n < count; n++) {
        for (let attempt = 0; attempt < attempts; attempt++) {
            const angle = (opts.randomInt(0, 359) * Math.PI) / 180;
            // sqrt for uniform area density; permille resolution is plenty.
            const t = opts.randomInt(0, 1000) / 1000;
            const r = Math.sqrt(minFromCenter ** 2 + t * (radius ** 2 - minFromCenter ** 2));
            const x = center.x + Math.cos(angle) * r;
            const y = center.y + Math.sin(angle) * r;
            if (!opts.isFree(x, y)) continue;
            const crowded = blockers.some((b) => (b.x - x) ** 2 + (b.y - y) ** 2 < minSpacing ** 2);
            if (crowded) continue;
            picked.push({ x, y });
            blockers.push({ x, y });
            break;
        }
    }
    return picked;
}
