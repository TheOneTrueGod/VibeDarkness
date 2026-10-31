/**
 * Folded and deployed Repair Post shape. A small core, charge pips just outside it, and four
 * arcs that spin around both. Folded (in flight) the arcs sit on the core's edge and the pips
 * are tucked inside the core. The open amount is game time since the deployable spawned.
 */
/** Core radius once placed, in pixels. Smaller than the turret's hull. */
export const REPAIR_POST_CORE_RADIUS = 7;
/** Core radius while folded in flight. */
export const REPAIR_POST_FOLDED_CORE_RADIUS = 6;
/** Arc ring radius once placed. Folded, the arcs sit on the core's edge. */
export const REPAIR_POST_ARC_RADIUS = 14;
/** Extra arc radius at the peak of a pulse's burst, in pixels. */
export const REPAIR_POST_ARC_BURST_DISTANCE = 7;
export const REPAIR_POST_ARC_COUNT = 4;
/** Angle each arc covers, in radians. The rest of the ring is gaps. */
export const REPAIR_POST_ARC_SPAN = (Math.PI * 2) / REPAIR_POST_ARC_COUNT * 0.6;
export const REPAIR_POST_ARC_WIDTH = 3;
/** Arc spin on wall time, so it keeps turning while the battle is paused. Degrees per second. */
export const REPAIR_POST_ARC_SPIN_DEGREES_PER_SECOND = 90;
/** Charge pip ring once placed: between the core and the arcs. */
export const REPAIR_POST_PIP_ORBIT = 10.5;
/** Charge pip ring while folded: inside the core. */
export const REPAIR_POST_FOLDED_PIP_ORBIT = 3;
export const REPAIR_POST_PIP_RADIUS = 2.2;
export const REPAIR_POST_FOLDED_PIP_RADIUS = 1.3;
/** First pip angle. Pips sit on the diagonals, between the arcs at rest. */
export const REPAIR_POST_PIP_START_ANGLE = Math.PI / 4;
/** How long the post takes to unfold after landing, in game seconds. */
export const REPAIR_POST_OPEN_DURATION = 0.2;

export interface RepairPostShape {
    coreRadius: number;
    arcRadius: number;
    pipOrbit: number;
    pipRadius: number;
}

/** Shape at `open` (0 folded, 1 placed) with the arcs pushed out by `burst` (0 to 1). */
export function repairPostShape(open: number, burst = 0): RepairPostShape {
    const t = clamp01(open);
    const coreRadius = lerp(REPAIR_POST_FOLDED_CORE_RADIUS, REPAIR_POST_CORE_RADIUS, t);
    return {
        coreRadius,
        arcRadius: lerp(coreRadius, REPAIR_POST_ARC_RADIUS, t) + clamp01(burst) * REPAIR_POST_ARC_BURST_DISTANCE,
        pipOrbit: lerp(REPAIR_POST_FOLDED_PIP_ORBIT, REPAIR_POST_PIP_ORBIT, t),
        pipRadius: lerp(REPAIR_POST_FOLDED_PIP_RADIUS, REPAIR_POST_PIP_RADIUS, t),
    };
}

/** Centre angle of arc `index` after `wallSeconds` of spin. */
export function repairPostArcAngle(index: number, wallSeconds: number): number {
    const spin = (wallSeconds * REPAIR_POST_ARC_SPIN_DEGREES_PER_SECOND * Math.PI) / 180;
    return spin + (index * Math.PI * 2) / REPAIR_POST_ARC_COUNT;
}

/** Local offset of charge pip `index` of `count`, evenly around the ring from the first diagonal. */
export function repairPostPipOffset(open: number, index: number, count: number): { x: number; y: number } {
    const shape = repairPostShape(open);
    const angle = REPAIR_POST_PIP_START_ANGLE + (count > 0 ? (index * Math.PI * 2) / count : 0);
    return { x: Math.cos(angle) * shape.pipOrbit, y: Math.sin(angle) * shape.pipOrbit };
}

/** 0 at the spawn instant, 1 once {@link REPAIR_POST_OPEN_DURATION} of game time has passed. */
export function repairPostOpenAmount(spawnedAtGameTime: number, gameTime: number): number {
    return clamp01((gameTime - spawnedAtGameTime) / REPAIR_POST_OPEN_DURATION);
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

function lerp(from: number, to: number, t: number): number {
    return from + (to - from) * t;
}
