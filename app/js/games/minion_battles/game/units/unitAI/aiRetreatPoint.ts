/**
 * pickRetreatPoint — where should a unit that wants distance go? Samples rings of candidate points
 * around an anchor (its home, an arena centre) and returns the open one whose NEAREST threat is
 * farthest away, skipping points too close to where the unit already stands. Deterministic: fixed
 * sample pattern, ties go to the earlier sample. Used by blinking/teleporting AIs (the Court
 * Magician); any kiting AI can use it to choose a walk goal too.
 */

type Point = { x: number; y: number };

export interface RetreatPointOptions {
    /** Centre of the area the unit may retreat within. */
    anchor: Point;
    /** Max distance from the anchor (px). Candidates lie on rings at 1/3, 2/3 and 3/3 of it. */
    radius: number;
    /** Where the unit stands now. */
    from: Point;
    /** Units to get away from. */
    threats: readonly Point[];
    /** Candidates closer than this to `from` are skipped (a retreat must actually move). Default 0. */
    minHop?: number;
    /** Samples per ring. Default 16. */
    samplesPerRing?: number;
    /** Only open points count (e.g. passable terrain inside the map). */
    isOpen: (x: number, y: number) => boolean;
}

export function pickRetreatPoint(opts: RetreatPointOptions): Point | null {
    const samples = opts.samplesPerRing ?? 16;
    const minHopSq = (opts.minHop ?? 0) ** 2;
    let best: Point | null = null;
    let bestScore = -Infinity;
    for (const frac of [1 / 3, 2 / 3, 1]) {
        const r = opts.radius * frac;
        for (let i = 0; i < samples; i++) {
            const a = (i / samples) * Math.PI * 2;
            const p = { x: opts.anchor.x + Math.cos(a) * r, y: opts.anchor.y + Math.sin(a) * r };
            if ((p.x - opts.from.x) ** 2 + (p.y - opts.from.y) ** 2 < minHopSq) continue;
            if (!opts.isOpen(p.x, p.y)) continue;
            let nearest = Infinity;
            for (const t of opts.threats) nearest = Math.min(nearest, Math.hypot(t.x - p.x, t.y - p.y));
            if (nearest > bestScore) {
                bestScore = nearest;
                best = p;
            }
        }
    }
    return best;
}
