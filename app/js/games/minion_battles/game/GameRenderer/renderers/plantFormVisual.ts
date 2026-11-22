import type { Graphics } from 'pixi.js';
import type { PlantFormLook, PlatedLookDef } from '../../units/unitRenderOptions';
import { halfEllipsePoints } from './halfEllipse';

/**
 * Painters for `renderOptions.plantForm` (artbook "silhouettes", Proposal A): each Garden kind keeps the Nightbloom
 * plates but has its own outline poking out past them, so kinds read apart at a glance, shell on or off. Drawn in
 * "art units" (a node's plates are 22 across the radius) and scaled to the unit's radius.
 */

const DEFAULT_PLATES: PlatedLookDef = { plateColor: 0x134e4a, seamColor: 0x0b2f2c, coreColor: 0xe9d5ff };
const DARK = 0x0f3d3a;
const RIM = 0x2a7a6f;
/** The turret's barrel and its thorns: lighter than the plates so the aim reads at a glance. */
const BARREL = 0x2f8577;
const CORE_DEEP = 0xc4a8f0;
const VINE = 0x2f6b3a;
const LEAF = 0x3f8a4a;
const PETAL_CLOSED = 0x3a2f5a;
const PETAL_OPEN = 0x7f6aa8;

/** Art units across a plated node's radius; the seed is drawn on its own (smaller) scale. */
const NODE_ART_RADIUS = 22;
const SEED_ART_RADIUS = 19;

/** Pen: art-unit coordinates, scaled by `s` and turned by `rot` about the unit centre. */
class Pen {
    private readonly cos: number;
    private readonly sin: number;
    constructor(
        readonly g: Graphics,
        readonly s: number,
        rot = 0,
    ) {
        this.cos = Math.cos(rot);
        this.sin = Math.sin(rot);
    }
    x(x: number, y: number): number {
        return (x * this.cos - y * this.sin) * this.s;
    }
    y(x: number, y: number): number {
        return (x * this.sin + y * this.cos) * this.s;
    }
    poly(points: readonly number[]): this {
        const out: number[] = [];
        for (let i = 0; i < points.length; i += 2) out.push(this.x(points[i]!, points[i + 1]!), this.y(points[i]!, points[i + 1]!));
        this.g.poly(out);
        return this;
    }
    circle(cx: number, cy: number, r: number): this {
        this.g.circle(this.x(cx, cy), this.y(cx, cy), r * this.s);
        return this;
    }
    /** An ellipse turned by `deg` about its own centre (as a polygon, so the pen's turn applies too). */
    ellipse(cx: number, cy: number, rx: number, ry: number, deg = 0): this {
        const a = (deg * Math.PI) / 180;
        const pts: number[] = [];
        for (let i = 0; i < 18; i++) {
            const t = (i / 18) * Math.PI * 2;
            const ex = Math.cos(t) * rx;
            const ey = Math.sin(t) * ry;
            pts.push(cx + ex * Math.cos(a) - ey * Math.sin(a), cy + ex * Math.sin(a) + ey * Math.cos(a));
        }
        return this.poly(pts);
    }
    /** Turn a whole art-space point about the origin by `deg` (for petals and spikes). */
    static turn(x: number, y: number, deg: number): [number, number] {
        const a = (deg * Math.PI) / 180;
        return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
    }
    moveTo(x: number, y: number): this {
        this.g.moveTo(this.x(x, y), this.y(x, y));
        return this;
    }
    lineTo(x: number, y: number): this {
        this.g.lineTo(this.x(x, y), this.y(x, y));
        return this;
    }
    curve(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
        this.g.bezierCurveTo(this.x(c1x, c1y), this.y(c1x, c1y), this.x(c2x, c2y), this.y(c2x, c2y), this.x(x, y), this.y(x, y));
        return this;
    }
    fill(color: number, alpha = 1): this {
        this.g.fill({ color, alpha });
        return this;
    }
    stroke(color: number, width: number, alpha = 1): this {
        this.g.stroke({ color, width: width * this.s, alpha, cap: 'round', join: 'round' });
        return this;
    }
}

/** Closed: two plates meeting on a glowing seam. Open: smaller plates swung apart (`dx`, `dy` shift, `tilt`). */
function plates(pen: Pen, colors: PlatedLookDef, r: number, open: { r: number; dx: number; dy: number; tilt: number } | null, timeSec: number): void {
    for (const side of [-1, 1] as const) {
        const rr = open ? open.r : r;
        const half = halfEllipsePoints(side, rr, rr, side * (open ? open.dx : 2), open ? side * open.tilt : 0);
        if (open) for (let i = 1; i < half.length; i += 2) half[i]! += open.dy;
        pen.poly(half).fill(colors.plateColor, 0.97);
        pen.poly(half).stroke(colors.seamColor, 1.2);
    }
    if (!open) {
        const glow = 0.55 + Math.sin(timeSec * 2.8) * 0.2;
        pen.moveTo(0, -r + 2).lineTo(0, r - 2).stroke(colors.coreColor, 1.5, glow);
    }
}

function core(pen: Pen, colors: PlatedLookDef, timeSec: number, inner: number = colors.coreColor): void {
    const pulse = 1 + Math.sin(timeSec * 3) * 0.08;
    pen.circle(0, 0, 9 * pulse).fill(CORE_DEEP);
    pen.circle(0, 0, 4).fill(inner);
}

/** The 8-point spiked base (Thornspitter), outer 25 / inner 15 art units. */
function spikedBase(pen: Pen, edge: number): void {
    const pts: number[] = [];
    for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const r = k % 2 === 0 ? 25 : 15;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    pen.poly(pts).fill(DARK);
    pen.poly(pts).stroke(edge, 1);
}

/** Thorned barrel along +x (the caller's pen is turned to the aim). */
function barrel(pen: Pen, colors: PlatedLookDef, open: boolean, timeSec: number): void {
    const edge = open ? colors.coreColor : colors.seamColor;
    for (const sy of [-1, 1]) {
        for (const bx of [10, 18]) {
            pen.poly([bx, 5 * sy, bx + 3, 10 * sy, bx + 6, 5 * sy]).fill(BARREL);
            pen.poly([bx, 5 * sy, bx + 3, 10 * sy, bx + 6, 5 * sy]).stroke(edge, 1);
        }
    }
    pen.poly([2, -5, 26, -5, 26, 5, 2, 5]).fill(BARREL);
    pen.poly([2, -5, 26, -5, 26, 5, 2, 5]).stroke(edge, 1.2);
    pen.poly([25, -3.5, 28, -3.5, 28, 3.5, 25, 3.5]).fill(open ? colors.coreColor : colors.seamColor);
    if (open) core(pen, colors, timeSec);
    else {
        pen.circle(0, 0, 8).fill(colors.plateColor);
        pen.circle(0, 0, 8).stroke(colors.seamColor, 1);
    }
}

function drawTurret(pen: Pen, aimPen: Pen, look: PlantFormLook, colors: PlatedLookDef, timeSec: number): void {
    spikedBase(pen, look.open ? colors.coreColor : RIM);
    plates(pen, colors, 19, look.open ? { r: 15, dx: 8, dy: 6, tilt: 20 } : null, timeSec);
    barrel(aimPen, colors, look.open, timeSec);
}

function drawMortar(pen: Pen, look: PlantFormLook, colors: PlatedLookDef, timeSec: number): void {
    pen.poly([-7, -35, 7, -35, 7, -17, -7, -17]).fill(DARK);
    pen.poly([-7, -35, 7, -35, 7, -17, -7, -17]).stroke(look.open ? colors.coreColor : RIM, 1);
    pen.ellipse(0, -35, 7, 2.5).fill(look.open ? colors.coreColor : colors.seamColor);
    plates(pen, colors, 22, look.open ? { r: 18, dx: 9, dy: 0, tilt: 22 } : null, timeSec);
    if (look.open) core(pen, colors, timeSec, colors.seamColor);
}

function drawGourd(pen: Pen, look: PlantFormLook, colors: PlatedLookDef, timeSec: number): void {
    pen.moveTo(0, -30).curve(4, -36, 10, -34, 8, -28).stroke(RIM, 2);
    pen.circle(0, -22, 9).fill(DARK);
    pen.circle(0, -22, 9).stroke(RIM, 1);
    pen.ellipse(0, 4, 25, 22).fill(colors.plateColor);
    pen.ellipse(0, 4, 25, 22).stroke(colors.seamColor, 1.2);
    if (!look.open) {
        const glow = 0.55 + Math.sin(timeSec * 2.8) * 0.2;
        pen.moveTo(0, -16).lineTo(0, 25).stroke(colors.coreColor, 1.5, glow);
        for (const [hx, hy] of [[-10, 2], [10, 8], [-6, 14]] as const) pen.circle(hx, hy, 2.5).fill(colors.seamColor);
        return;
    }
    for (const [hx, hy] of [[-10, 2], [10, 8], [-6, 15], [8, -6]] as const) pen.circle(hx, hy, 4).fill(colors.coreColor);
    // Motes drifting round the gourd: its brood stirring.
    for (let i = 0; i < 3; i++) {
        const a = timeSec * 1.4 + (i * Math.PI * 2) / 3;
        pen.circle(Math.cos(a) * 28, Math.sin(a) * 22, 2).fill(CORE_DEEP);
    }
}

function drawCreeper(pen: Pen, look: PlantFormLook, colors: PlatedLookDef, timeSec: number): void {
    if (!look.open) {
        pen.moveTo(0, -20).curve(6, -30, 16, -30, 18, -22).stroke(VINE, 4);
        pen.moveTo(0, 20).curve(-6, 30, -16, 30, -18, 22).stroke(VINE, 4);
        pen.ellipse(20, -20, 5, 3).fill(LEAF);
        pen.ellipse(-20, 20, 5, 3).fill(LEAF);
        plates(pen, colors, 21, null, timeSec);
        return;
    }
    pen.moveTo(0, 0)
        .curve(8, -4, 10, 8, 2, 10)
        .curve(-8, 12, -14, 0, -10, -10)
        .curve(-6, -20, 12, -22, 18, -12)
        .curve(24, -2, 22, 16, 8, 24)
        .curve(-6, 30, -24, 22, -28, 8)
        .stroke(VINE, 5);
    for (const [x, y, dx, dy] of [[20, -14, 5, -3], [22, 6, 6, 1], [-22, 20, -3, 5], [-27, 4, -6, -1]] as const) {
        pen.moveTo(x, y).lineTo(x + dx, y + dy).stroke(colors.coreColor, 1.5);
    }
    const pulse = 1 + Math.sin(timeSec * 3) * 0.15;
    pen.circle(0, 0, 4 * pulse).fill(CORE_DEEP);
}

function drawLily(pen: Pen, look: PlantFormLook, colors: PlatedLookDef, timeSec: number): void {
    for (let k = 0; k < 5; k++) {
        const deg = k * 72;
        if (look.open) {
            const [px, py] = Pen.turn(0, -19, deg);
            pen.ellipse(px, py, 9, 16, deg).fill(PETAL_OPEN);
        } else {
            const [px, py] = Pen.turn(0, -22, deg);
            pen.ellipse(px, py, 6, 12, deg).fill(PETAL_CLOSED);
        }
    }
    if (look.open) core(pen, colors, timeSec);
    else plates(pen, colors, 20, null, timeSec);
}

function drawSeed(pen: Pen, look: PlantFormLook, colors: PlatedLookDef): void {
    const bursting = look.bursting !== null;
    pen.ellipse(0, 0, bursting ? 15 : 14, bursting ? 20 : 19).fill(colors.plateColor);
    pen.ellipse(0, 0, bursting ? 15 : 14, bursting ? 20 : 19).stroke(colors.seamColor, 1.2);
    pen.moveTo(0, -19).curve(2, -25, 6, -27, 9, -26).stroke(RIM, 2);
    pen.moveTo(0, -19).lineTo(-3, -8).lineTo(3, 0).lineTo(-2, 10).lineTo(0, 19);
    if (!bursting) {
        pen.stroke(colors.seamColor, 1.5);
        return;
    }
    // The cracks glow brighter as the blast comes due.
    const alpha = 0.6 + 0.4 * (look.bursting ?? 0);
    pen.stroke(colors.coreColor, 2, alpha);
    pen.moveTo(3, 0).lineTo(11, -6).stroke(colors.coreColor, 2, alpha);
    pen.moveTo(-2, 10).lineTo(-10, 14).stroke(colors.coreColor, 2, alpha);
}

/** Draw `look` into `g` (cleared by the caller), centred on the unit. `aim` is the turret's angle (radians). */
export function drawPlantForm(g: Graphics, look: PlantFormLook, radius: number, timeSec: number, aim: number): void {
    const colors = look.plated ?? DEFAULT_PLATES;
    if (look.form === 'seed') {
        drawSeed(new Pen(g, radius / SEED_ART_RADIUS), look, colors);
        return;
    }
    const s = radius / NODE_ART_RADIUS;
    const pen = new Pen(g, s);
    switch (look.form) {
        case 'turret':
            drawTurret(pen, new Pen(g, s, aim), look, colors, timeSec);
            break;
        case 'mortar':
            drawMortar(pen, look, colors, timeSec);
            break;
        case 'gourd':
            drawGourd(pen, look, colors, timeSec);
            break;
        case 'creeper':
            drawCreeper(pen, look, colors, timeSec);
            break;
        case 'lily':
            drawLily(pen, look, colors, timeSec);
            break;
    }
}
