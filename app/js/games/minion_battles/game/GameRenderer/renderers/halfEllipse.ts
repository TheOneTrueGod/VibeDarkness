/** Shared shell geometry for the plated and plant-form painters (no imports, so either can use it). */

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
