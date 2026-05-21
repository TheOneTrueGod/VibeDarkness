import type { Graphics } from 'pixi.js';

export interface RingPulseSpec {
    delay: number;
    startRadius: number;
    endRadius: number;
    width: number;
    opacityMul: number;
}

export function getStaggeredProgress(progress: number, delay: number): number {
    return progress <= delay ? 0 : Math.min(1, (progress - delay) / (1 - delay));
}

export function drawRingBursts(
    g: Graphics,
    progress: number,
    colors: number[],
    rings: RingPulseSpec[],
    getAlpha: (effectiveProgress: number, ring: RingPulseSpec) => number,
): void {
    for (let i = 0; i < rings.length; i++) {
        const ring = rings[i]!;
        const effectiveProgress = getStaggeredProgress(progress, ring.delay);
        const radius = ring.startRadius + (ring.endRadius - ring.startRadius) * effectiveProgress;
        const alpha = Math.max(0, getAlpha(effectiveProgress, ring));
        const color = colors[i] ?? colors[colors.length - 1] ?? 0xffffff;
        g.circle(0, 0, radius);
        g.stroke({ color, width: ring.width, alpha });
    }
}
