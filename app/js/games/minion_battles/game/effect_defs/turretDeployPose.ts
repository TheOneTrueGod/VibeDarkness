/**
 * Folded and deployed turret shape. The open amount is game time since the sentry spawned.
 */
/** Body radius of the deployed turret, and of the placement footprint, in pixels. */
export const TURRET_BODY_RADIUS = 10;
/** Hull radius of the folded turret while it is still in the air. */
export const TURRET_FOLDED_BODY_RADIUS = 7;
/** How far the barrel sticks out once the turret is open, in pixels. */
export const TURRET_BARREL_LENGTH = 16;
/** How far the barrel sticks out while the turret is folded. */
export const TURRET_FOLDED_BARREL_LENGTH = 8;
export const TURRET_BARREL_WIDTH = 5;
/** Share of the hull radius where the barrel graphic starts, so it overlaps the body. */
export const TURRET_BARREL_INSET_FRACTION = 0.25;
/** Distance of the shot pips from the hull center once they have moved out. */
export const TURRET_DOT_ORBIT = 16;
/** Distance of the shot pips while they are still bunched on the folded turret. */
export const TURRET_FOLDED_DOT_ORBIT = 6;
/** Arc, in radians, the pips cover opposite the barrel when open. */
export const TURRET_DOT_SPREAD = Math.PI * 0.9;
/** Arc, in radians, the pips cover while folded. */
export const TURRET_FOLDED_DOT_SPREAD = 0.7;
export const TURRET_DOT_RADIUS = 2.5;
/** How long the barrel and pips take to move into the deployed pose, in game seconds. */
export const TURRET_OPEN_DURATION = 0.16;

export interface TurretOpenShape {
    bodyRadius: number;
    barrelLength: number;
    barrelWidth: number;
    /** Where the barrel rectangle starts, overlapping the hull. */
    barrelInset: number;
    dotOrbit: number;
    dotSpread: number;
    dotRadius: number;
}

/** Shape of the turret at `open` (0 folded, 1 deployed). Barrel points along local +x. */
export function turretOpenShape(open: number): TurretOpenShape {
    const t = clamp01(open);
    const bodyRadius = lerp(TURRET_FOLDED_BODY_RADIUS, TURRET_BODY_RADIUS, t);
    return {
        bodyRadius,
        barrelLength: lerp(TURRET_FOLDED_BARREL_LENGTH, TURRET_BARREL_LENGTH, t),
        barrelWidth: TURRET_BARREL_WIDTH,
        barrelInset: bodyRadius * TURRET_BARREL_INSET_FRACTION,
        dotOrbit: lerp(TURRET_FOLDED_DOT_ORBIT, TURRET_DOT_ORBIT, t),
        dotSpread: lerp(TURRET_FOLDED_DOT_SPREAD, TURRET_DOT_SPREAD, t),
        dotRadius: TURRET_DOT_RADIUS,
    };
}

/** Local offset of shot pip `index`. Pips sit opposite the barrel (+x). */
export function turretDotOffset(open: number, index: number, count: number): { x: number; y: number } {
    const shape = turretOpenShape(open);
    const u = count <= 1 ? 0 : index / (count - 1) - 0.5;
    const angle = Math.PI + u * shape.dotSpread;
    return {
        x: Math.cos(angle) * shape.dotOrbit,
        y: Math.sin(angle) * shape.dotOrbit,
    };
}

/** 0 at the spawn instant, 1 once {@link TURRET_OPEN_DURATION} of game time has passed. */
export function turretOpenAmount(spawnedAtGameTime: number, gameTime: number): number {
    if (TURRET_OPEN_DURATION <= 0) return 1;
    return clamp01((gameTime - spawnedAtGameTime) / TURRET_OPEN_DURATION);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}
