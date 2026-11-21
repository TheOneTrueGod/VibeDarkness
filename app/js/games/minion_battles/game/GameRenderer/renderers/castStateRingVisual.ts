/**
 * Draws the cast-state ring (`UnitDefEntry.castStateRing`, state from `units/castStateRing.ts`) just inside
 * the unit's body edge, on top of the body:
 * - acting: a dark-red track with a red arc filling clockwise from the top;
 * - recovering: a thinner pale-red arc draining clockwise;
 * - ready: hidden.
 *
 * Render-only: created lazily on the unit visual, keeps no game state.
 */
import { Graphics, type Container } from 'pixi.js';
import type { CastStateRing } from '../../units/castStateRing';

export const CAST_STATE_RING_LABEL = 'castStateRing';

const ACTING_COLOR = 0xef4444;
const ACTING_TRACK_COLOR = 0x7f1d1d;
const ACTING_WIDTH = 3;
const RECOVERING_COLOR = 0xfca5a5;
const RECOVERING_WIDTH = 2;
const START_ANGLE = -Math.PI / 2;

/**
 * Shared arc painter: a ring of `radius` filled clockwise from the top by `fraction` (0-1). Nothing is drawn at
 * (near) 0, a full circle at (near) 1. Used by the cast-state ring and the timer ring. Does not clear `g`.
 */
export function strokeClockwiseArc(
    g: Graphics,
    radius: number,
    fraction: number,
    style: { color: number; width: number; alpha?: number },
): void {
    const f = Math.min(1, Math.max(0, fraction));
    if (f <= 0.005) return;
    if (f >= 0.995) {
        g.circle(0, 0, radius);
    } else {
        g.arc(0, 0, radius, START_ANGLE, START_ANGLE + f * Math.PI * 2);
    }
    g.stroke(style);
}

/** Draw `state` into `g` for a body of `radius`. */
export function drawCastStateRing(g: Graphics, radius: number, state: CastStateRing): void {
    g.clear();
    const width = state.kind === 'acting' ? ACTING_WIDTH : RECOVERING_WIDTH;
    const r = Math.max(1, radius - width / 2 - 0.5);
    if (state.kind === 'acting') {
        g.circle(0, 0, r);
        g.stroke({ color: ACTING_TRACK_COLOR, width, alpha: 0.6 });
    }
    strokeClockwiseArc(
        g,
        r,
        state.fraction,
        state.kind === 'acting' ? { color: ACTING_COLOR, width } : { color: RECOVERING_COLOR, width, alpha: 0.75 },
    );
}

/** Show (drawing `state`) or hide the ring on a unit visual. */
export function syncCastStateRing(visual: Container, radius: number, state: CastStateRing | null): void {
    let ring = visual.children.find((c) => c.label === CAST_STATE_RING_LABEL) as Graphics | undefined;
    if (!state) {
        if (ring) ring.visible = false;
        return;
    }
    if (!ring) {
        ring = new Graphics();
        ring.label = CAST_STATE_RING_LABEL;
        ring.eventMode = 'none';
        visual.addChild(ring);
    }
    drawCastStateRing(ring, radius, state);
    ring.visible = true;
}
