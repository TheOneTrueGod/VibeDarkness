import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Unit } from '../../units/Unit';
import { resolvePlatedLook, type PlatedLook } from '../../units/unitRenderOptions';

/**
 * Painters for `UnitDefEntry.renderOptions` that live INSIDE the unit visual, so they move, fade, scale and sink
 * (burrow / drowning clip) with the body. What to draw comes from the pure resolvers in `units/unitRenderOptions.ts`.
 */

const PLATED_LABEL = 'platedLook';
const SPIKE_COUNT = 10;
/** How far each half of an open shell swings out, in radii, and how far it tilts. */
const OPEN_SPLIT_RADII = 0.42;
const OPEN_TILT_DEG = 8;
const HALF_STEPS = 12;

/** Points of the left (`side` -1) or right (+1) half of an ellipse, closed along the seam, rotated then shifted. */
export function halfEllipsePoints(side: -1 | 1, rx: number, ry: number, offsetX: number, tiltDeg: number): number[] {
    const out: number[] = [];
    const rad = (tiltDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Sweep from the top (-90 deg) round the outside to the bottom (+90 deg); the closing edge is the seam.
    for (let i = 0; i <= HALF_STEPS; i++) {
        const a = -Math.PI / 2 + (i / HALF_STEPS) * Math.PI;
        const x = Math.cos(a) * rx * side;
        const y = Math.sin(a) * ry;
        out.push(x * cos - y * sin + offsetX, x * sin + y * cos);
    }
    return out;
}

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

/**
 * Add, update or hide the plated look child of a unit visual. Cheap when the def has no `plated` option (one def
 * lookup, nothing created).
 */
export function syncPlatedLook(visual: Container, unit: Unit, timeSec: number): void {
    const look = unit.isAlive() ? resolvePlatedLook(unit) : null;
    let g = visual.children.find((c) => c.label === PLATED_LABEL) as Graphics | undefined;
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
