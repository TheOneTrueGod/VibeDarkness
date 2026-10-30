/**
 * Folded and deployed turret shape. The open amount is game time since the sentry spawned.
 */
import {
    TURRET_BARREL_INSET_FRACTION,
    TURRET_BARREL_LENGTH,
    TURRET_BARREL_WIDTH,
    TURRET_BODY_RADIUS,
    TURRET_DOT_ORBIT,
    TURRET_DOT_RADIUS,
    TURRET_DOT_SPREAD,
    TURRET_FOLDED_BARREL_LENGTH,
    TURRET_FOLDED_BODY_RADIUS,
    TURRET_FOLDED_DOT_ORBIT,
    TURRET_FOLDED_DOT_SPREAD,
    TURRET_OPEN_DURATION,
} from '../../card_defs/10_armory_core/armoryConstants';

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
