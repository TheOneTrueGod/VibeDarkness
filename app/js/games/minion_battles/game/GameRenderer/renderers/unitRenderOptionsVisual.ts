import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Unit } from '../../units/Unit';
import { resolvePlantForm, resolvePlatedLook, resolveTimerRing, type PlatedLook } from '../../units/unitRenderOptions';
import { drawPlantForm } from './plantFormVisual';
import { halfEllipsePoints } from './halfEllipse';

export { halfEllipsePoints };
import { strokeClockwiseArc } from './castStateRingVisual';

/**
 * Painters for `UnitDefEntry.renderOptions` that live INSIDE the unit visual, so they move, fade, scale and sink
 * (burrow / drowning clip) with the body. What to draw comes from the pure resolvers in `units/unitRenderOptions.ts`.
 */

const PLATED_LABEL = 'platedLook';
const SPIKE_COUNT = 10;
/** How far each half of an open shell swings out, in radii, and how far it tilts. */
const OPEN_SPLIT_RADII = 0.42;
const OPEN_TILT_DEG = 8;

/** Plated shell, closed (two plates meeting on a glowing seam) or open (plates swung apart round a bare core). */
export function drawPlatedLook(g: Graphics, look: PlatedLook, radius: number, timeSec: number): void {
    const { plateColor, seamColor, coreColor } = look.def;
    const rx = radius * 0.95;
    const ry = radius * 1.05;
    const open = look.state === 'open';
    const split = open ? radius * OPEN_SPLIT_RADII : 0;
    const tilt = open ? OPEN_TILT_DEG : 0;

    if (open) {
        // The core shows between the plates and pulses slowly.
        const pulse = 0.85 + Math.sin(timeSec * 3) * 0.15;
        g.circle(0, 0, radius * 0.62 * pulse);
        g.fill({ color: coreColor, alpha: 0.28 });
        g.circle(0, 0, radius * 0.42);
        g.fill({ color: coreColor, alpha: 0.95 });
        g.circle(0, 0, radius * 0.42);
        g.stroke({ color: seamColor, width: 1.5, alpha: 0.8 });
    } else {
        // Plate spikes round the rim (drawn first so the plates overlap their roots).
        for (let k = 0; k < SPIKE_COUNT; k++) {
            const a = (k / SPIKE_COUNT) * Math.PI * 2;
            const bx = Math.cos(a) * rx;
            const by = Math.sin(a) * ry;
            const tx = Math.cos(a) * (rx + radius * 0.22);
            const ty = Math.sin(a) * (ry + radius * 0.22);
            const nx = -Math.sin(a) * radius * 0.1;
            const ny = Math.cos(a) * radius * 0.1;
            g.poly([bx + nx, by + ny, tx, ty, bx - nx, by - ny]);
            g.fill({ color: seamColor, alpha: 0.95 });
        }
    }

    for (const side of [-1, 1] as const) {
        const pts = halfEllipsePoints(side, rx, ry, side * split, side * tilt);
        g.poly(pts);
        g.fill({ color: plateColor, alpha: 0.96 });
        g.poly(pts);
        g.stroke({ color: seamColor, width: 2.4, alpha: 0.95 });
    }

    if (!open) {
        // Faint plate lines and a glowing seam.
        for (const sx of [-1, 1]) {
            const x = rx * 0.55 * sx;
            g.moveTo(x, -ry * 0.8);
            g.quadraticCurveTo(x * 1.55, 0, x, ry * 0.8);
            g.stroke({ color: seamColor, width: 1.4, alpha: 0.8 });
        }
        const glow = 0.45 + Math.sin(timeSec * 2.8) * 0.2;
        g.moveTo(0, -ry + 2);
        g.lineTo(0, ry - 2);
        g.stroke({ color: coreColor, width: 1.6, alpha: glow });
    }
}

/** How fast a turret's barrel turns toward a new aim (per second, exponential). */
const AIM_TURN_RATE = 10;
/** Starting aim before a target is ever seen: up the screen. */
const DEFAULT_AIM = -Math.PI / 2;
const aimByUnit = new WeakMap<Unit, { angle: number; timeSec: number }>();

/** Ease the drawn aim toward `target` (radians; null keeps the last aim) over the wall time since the last frame. */
export function easePlantAim(unit: Unit, target: number | null, timeSec: number): number {
    const prev = aimByUnit.get(unit);
    let angle = prev?.angle ?? target ?? DEFAULT_AIM;
    if (prev && target !== null) {
        const dt = Math.max(0, Math.min(0.25, timeSec - prev.timeSec));
        let delta = target - angle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        angle += delta * (1 - Math.exp(-AIM_TURN_RATE * dt));
    }
    aimByUnit.set(unit, { angle, timeSec });
    return angle;
}

/**
 * Add, update or hide the plated look child of a unit visual. Cheap when the def has no `plated` option (one def
 * lookup, nothing created). A unit with `renderOptions.plantForm` draws its plant form instead (which shows the same
 * shell state); `aim` is where an aiming form points (radians, null keeps the last aim).
 */
export function syncPlatedLook(visual: Container, unit: Unit, timeSec: number, aim: number | null = null): void {
    const plant = unit.isAlive() ? resolvePlantForm(unit) : null;
    const look = plant || !unit.isAlive() ? null : resolvePlatedLook(unit);
    let g = visual.children.find((c) => c.label === PLATED_LABEL) as Graphics | undefined;
    if (plant) {
        if (!g) {
            g = new Graphics();
            g.label = PLATED_LABEL;
            g.eventMode = 'none';
            visual.addChild(g);
        }
        g.visible = true;
        g.clear();
        drawPlantForm(g, plant, unit.radius, timeSec, easePlantAim(unit, aim, timeSec));
        return;
    }
    if (!look) {
        if (g) g.visible = false;
        return;
    }
    if (!g) {
        g = new Graphics();
        g.label = PLATED_LABEL;
        g.eventMode = 'none';
        visual.addChild(g);
    }
    g.visible = true;
    g.clear();
    drawPlatedLook(g, look, unit.radius, timeSec);
}

const TIMER_RING_LABEL = 'timerRing';

/**
 * Add, update or hide the timer ring child of a unit visual (`renderOptions.timerRing`): a thin arc just outside the
 * body, draining clockwise from the top. `timeSec` is world time. Cheap when the def has no `timerRing` option.
 */
export function syncTimerRing(visual: Container, unit: Unit, timeSec: number): void {
    const ring = unit.isAlive() ? resolveTimerRing(unit, timeSec) : null;
    let g = visual.children.find((c) => c.label === TIMER_RING_LABEL) as Graphics | undefined;
    if (!ring) {
        if (g) g.visible = false;
        return;
    }
    if (!g) {
        g = new Graphics();
        g.label = TIMER_RING_LABEL;
        g.eventMode = 'none';
        visual.addChild(g);
    }
    g.visible = true;
    g.clear();
    strokeClockwiseArc(g, unit.radius + ring.offsetPx + ring.width / 2, ring.fraction, {
        color: ring.color,
        width: ring.width,
        alpha: ring.alpha,
    });
}
