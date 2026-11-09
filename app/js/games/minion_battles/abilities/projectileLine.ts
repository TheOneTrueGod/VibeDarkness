/**
 * Geometry for a row of lobbed shots that runs beside the target rather than at it: the aim line is
 * turned `angleRad` away from caster -> aim, and `count` landing points are spaced `spacing` apart
 * along that turned line, centred on the aim's distance. Zone-control abilities (Husk Disease Cloud)
 * use it to wall off one side of a target; anything that wants a line of impacts at an angle can too.
 */

export type Point = { x: number; y: number };

/** Which way the line is turned from the aim: `1` = clockwise on screen (towards +y), `-1` = counter-clockwise. */
export type LineSide = 1 | -1;

export interface AngledLineOptions {
    /** Turn from the caster -> aim direction, in radians (positive; `side` picks the direction). */
    angleRad: number;
    side: LineSide;
    /** Landing points to produce. */
    count: number;
    /** Distance between neighbouring landing points, in px. */
    spacing: number;
    /** Landing points closer than this to the origin are dropped (a lob cannot land on its thrower). */
    minDistance?: number;
}

/** Landing points of an angled line, nearest the origin first. Empty when aim and origin coincide. */
export function resolveAngledLine(origin: Point, aim: Point, opts: AngledLineOptions): Point[] {
    const dx = aim.x - origin.x;
    const dy = aim.y - origin.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return [];

    const angle = Math.atan2(dy, dx) + opts.side * opts.angleRad;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const minDistance = opts.minDistance ?? 0;

    const points: Point[] = [];
    for (let i = 0; i < opts.count; i++) {
        const along = dist + (i - (opts.count - 1) / 2) * opts.spacing;
        if (along < minDistance) continue;
        points.push({ x: origin.x + dirX * along, y: origin.y + dirY * along });
    }
    return points;
}

/**
 * Picks the side whose line scores lower (e.g. fewer cells already gassed), so repeated casts fill in
 * both sides of a target. A tie goes to `tieBreak()`, which should draw from the engine RNG.
 */
export function pickLeastCoveredSide(
    scoreSide: (side: LineSide) => number,
    tieBreak: () => LineSide,
): LineSide {
    const left = scoreSide(-1);
    const right = scoreSide(1);
    if (left === right) return tieBreak();
    return left < right ? -1 : 1;
}
