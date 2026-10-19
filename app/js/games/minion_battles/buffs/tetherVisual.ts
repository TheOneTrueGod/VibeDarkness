/**
 * Snaking tether: ethereal strands that wind between two points, with waves and beads flowing
 * from `from` to `to`. Drawn in whatever local space the caller's Graphics uses (buff visuals draw
 * in the owning unit's local space, so `from` is usually (0, 0)). Reusable for any unit-to-unit
 * link; style is data (`TetherStyle`), with named presets below.
 */

import type { Graphics } from 'pixi.js';

export interface TetherStyle {
    /** Wide, faint outer stroke. */
    glowColor: number;
    /** Thin bright inner stroke. */
    coreColor: number;
    /** Beads that flow along the strands. */
    beadColor: number;
    strandCount: number;
    /** Max sideways swing of a strand (px). */
    amplitude: number;
    /** Distance (px) per full wave along the tether. */
    wavelength: number;
    /** Wave travel speed toward `to` (waves per second). */
    flowSpeed: number;
    /** Beads per strand. */
    beadsPerStrand: number;
    /** Overall opacity (before the flicker). */
    alpha: number;
}

export const TETHER_STYLE_PRESETS = {
    blood: {
        glowColor: 0x7f1d1d,
        coreColor: 0xdc2626,
        beadColor: 0xfca5a5,
        strandCount: 2,
        amplitude: 9,
        wavelength: 90,
        flowSpeed: 0.9,
        beadsPerStrand: 3,
        alpha: 0.55,
    },
} as const satisfies Record<string, TetherStyle>;

export type TetherStylePresetId = keyof typeof TETHER_STYLE_PRESETS;

const SEGMENTS = 28;

export interface TetherEndpoints {
    from: { x: number; y: number };
    to: { x: number; y: number };
    /** Strands start/end this far from each point (e.g. unit radii) so they don't cover sprites. */
    fromInset?: number;
    toInset?: number;
}

/** Draw the tether at wall time `time` (seconds). */
export function drawSnakingTether(g: Graphics, ends: TetherEndpoints, style: TetherStyle, time: number): void {
    const dx = ends.to.x - ends.from.x;
    const dy = ends.to.y - ends.from.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    const t0 = Math.min(1, (ends.fromInset ?? 0) / dist);
    const t1 = Math.max(0, 1 - (ends.toInset ?? 0) / dist);
    if (t1 <= t0) return;

    const nx = -dy / dist;
    const ny = dx / dist;
    const waves = dist / style.wavelength;
    const flicker = 0.85 + 0.15 * Math.sin(time * 7.3);

    const pointAt = (t: number, strand: number): { x: number; y: number } => {
        const phase = (strand / style.strandCount) * Math.PI * 2;
        // Envelope pins the strands to both ends; the wave term moves toward `to` as time advances.
        const envelope = Math.sin(Math.PI * ((t - t0) / (t1 - t0)));
        const swing = style.amplitude * envelope
            * Math.sin((t * waves - time * style.flowSpeed) * Math.PI * 2 + phase);
        return { x: ends.from.x + dx * t + nx * swing, y: ends.from.y + dy * t + ny * swing };
    };

    for (let s = 0; s < style.strandCount; s++) {
        for (const pass of [
            { color: style.glowColor, width: 5, alpha: style.alpha * 0.45 },
            { color: style.coreColor, width: 1.5, alpha: style.alpha },
        ]) {
            const start = pointAt(t0, s);
            g.moveTo(start.x, start.y);
            for (let i = 1; i <= SEGMENTS; i++) {
                const p = pointAt(t0 + ((t1 - t0) * i) / SEGMENTS, s);
                g.lineTo(p.x, p.y);
            }
            g.stroke({ color: pass.color, width: pass.width, alpha: pass.alpha * flicker });
        }
        for (let b = 0; b < style.beadsPerStrand; b++) {
            const cycle = (time * style.flowSpeed * 0.6 + b / style.beadsPerStrand + s * 0.17) % 1;
            const p = pointAt(t0 + (t1 - t0) * cycle, s);
            g.circle(p.x, p.y, 2);
            g.fill({ color: style.beadColor, alpha: style.alpha * Math.sin(Math.PI * cycle) * flicker });
        }
    }
}
