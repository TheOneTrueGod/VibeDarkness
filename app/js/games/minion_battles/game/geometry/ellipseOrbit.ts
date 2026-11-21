/**
 * Moving around an elliptical band: "go N tiles clockwise around the centre of the map, staying on the ring path".
 * Pure geometry, no engine imports. Used by orbit destination rules (e.g. the Garden Heart circling its pond).
 *
 * An orbit is a centre, the radii of the band's middle line, and a thickness. A point is placed on the ellipse grown
 * or shrunk by a depth (-thickness/2 .. +thickness/2, both radii change by the same amount), so each move can land a
 * little inside or outside the middle line and the path is not a perfect ellipse.
 *
 * Angles are the ellipse's parametric angle `t` (x = cx + rx cos t, y = cy + ry sin t). Screen y points down, so a
 * growing `t` turns CLOCKWISE on screen.
 */

export interface EllipseOrbitDef {
    /** Centre of the band (world px). */
    cx: number;
    cy: number;
    /** Radii of the band's middle line (world px). */
    rx: number;
    ry: number;
    /** Full width of the band (world px): a point lands at most half of it inside or outside the middle line. */
    thicknessPx: number;
}

/** The parametric angle of `p` around the orbit (its direction from the centre, with the ellipse squashed to a circle). */
export function ellipseOrbitAngle(orbit: Pick<EllipseOrbitDef, 'cx' | 'cy' | 'rx' | 'ry'>, p: { x: number; y: number }): number {
    const dx = (p.x - orbit.cx) / Math.max(1e-6, orbit.rx);
    const dy = (p.y - orbit.cy) / Math.max(1e-6, orbit.ry);
    if (dx === 0 && dy === 0) return 0;
    return Math.atan2(dy, dx);
}

/** The point at parametric angle `t` on the orbit's ellipse grown by `depthPx` (negative shrinks it). */
export function ellipseOrbitPoint(orbit: EllipseOrbitDef, t: number, depthPx: number): { x: number; y: number } {
    const rx = Math.max(1, orbit.rx + depthPx);
    const ry = Math.max(1, orbit.ry + depthPx);
    return { x: orbit.cx + rx * Math.cos(t), y: orbit.cy + ry * Math.sin(t) };
}

/** Steps per radian when walking the ellipse for an arc length (plenty for map-sized ellipses). */
const ARC_STEPS_PER_RADIAN = 64;

/**
 * The parametric angle reached by walking `arcPx` along the middle line from angle `fromT`, clockwise for a positive
 * arc and counter-clockwise for a negative one. Integrates the ellipse's speed `|dP/dt|` in small steps.
 */
export function ellipseOrbitAdvance(orbit: EllipseOrbitDef, fromT: number, arcPx: number): number {
    const dir = arcPx >= 0 ? 1 : -1;
    let left = Math.abs(arcPx);
    let t = fromT;
    const dt = 1 / ARC_STEPS_PER_RADIAN;
    // Bounded: never more than a few laps, whatever the input.
    for (let guard = 0; left > 0 && guard < ARC_STEPS_PER_RADIAN * 64; guard++) {
        const mid = t + (dir * dt) / 2; // midpoint rule, as `ellipseOrbitClockwiseArc` measures
        const speed = Math.hypot(orbit.rx * Math.sin(mid), orbit.ry * Math.cos(mid));
        const step = speed * dt;
        if (step >= left) {
            t += dir * dt * (left / step);
            break;
        }
        left -= step;
        t += dir * dt;
    }
    return t;
}

/**
 * Where a unit at `from` lands after moving `arcPx` clockwise around the orbit (negative: counter-clockwise), at
 * `depthPx` inside (-) or outside (+) the band's middle line. A unit off the band starts from its own direction
 * from the centre, so the first move also brings it onto the band.
 */
export function moveAroundEllipseOrbit(
    orbit: EllipseOrbitDef,
    from: { x: number; y: number },
    arcPx: number,
    depthPx: number,
): { x: number; y: number } {
    const half = orbit.thicknessPx / 2;
    const depth = Math.min(half, Math.max(-half, depthPx));
    const t = ellipseOrbitAdvance(orbit, ellipseOrbitAngle(orbit, from), arcPx);
    return ellipseOrbitPoint(orbit, t, depth);
}

/** The clockwise arc (world px, along the middle line) from angle `fromT` to angle `toT`, in [0, one lap). */
export function ellipseOrbitClockwiseArc(orbit: EllipseOrbitDef, fromT: number, toT: number): number {
    const lap = Math.PI * 2;
    const span = (((toT - fromT) % lap) + lap) % lap;
    const steps = Math.max(1, Math.ceil(span * ARC_STEPS_PER_RADIAN));
    const dt = span / steps;
    let arc = 0;
    for (let i = 0; i < steps; i++) {
        const t = fromT + (i + 0.5) * dt;
        arc += Math.hypot(orbit.rx * Math.sin(t), orbit.ry * Math.cos(t)) * dt;
    }
    return arc;
}
