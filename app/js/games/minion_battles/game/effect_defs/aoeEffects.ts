import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { drawRingBursts, type RingPulseSpec } from './helpers';

/** Default gravity kit violet (`#a855f7`). */
export const GRAVITY_VIOLET = 0xa855f7;

export const GRAVITY_FIELD_EFFECT_TYPE = 'GravityField';
export const LIFT_COLUMN_EFFECT_TYPE = 'LiftColumn';

export interface GravityFieldEffectData {
    direction?: 'in' | 'out';
    color?: number;
    radius?: number;
    /** Global alpha multiplier for the field visual (default 1). */
    alpha?: number;
}

export interface LiftColumnEffectData {
    color?: number;
    radius?: number;
}

function drawOutwardGravityField(
    g: Graphics,
    progress: number,
    radius: number,
    color: number,
    alphaMul: number,
): void {
    const rings: RingPulseSpec[] = [
        { delay: 0, startRadius: radius * 0.15, endRadius: radius, width: 3, opacityMul: 1 },
        { delay: 0.08, startRadius: radius * 0.1, endRadius: radius * 0.85, width: 2, opacityMul: 0.75 },
        { delay: 0.16, startRadius: radius * 0.05, endRadius: radius * 0.7, width: 1.5, opacityMul: 0.55 },
    ];
    const colors = [color, color, color];
    drawRingBursts(g, progress, colors, rings, (effectiveProgress, ring) =>
        alphaMul * 0.55 * ring.opacityMul * (1 - effectiveProgress * 0.95),
    );

    const crackCount = 8;
    const crackAlpha = Math.max(0, alphaMul * 0.45 * (1 - progress * 0.6));
    for (let i = 0; i < crackCount; i++) {
        const baseAngle = (i / crackCount) * Math.PI * 2;
        const innerR = radius * (0.2 + progress * 0.15);
        const outerR = radius * (0.55 + progress * 0.35);
        const wobble = Math.sin(progress * Math.PI * 4 + i) * 0.08;
        const angle = baseAngle + wobble;
        g.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
        g.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
        g.stroke({ color, width: 1.5, alpha: crackAlpha });
    }
}

function drawInwardGravityField(
    g: Graphics,
    progress: number,
    radius: number,
    color: number,
    alphaMul: number,
): void {
    const streamCount = 6;
    const particlesPerStream = 5;
    for (let s = 0; s < streamCount; s++) {
        const baseAngle = (s / streamCount) * Math.PI * 2 + progress * Math.PI * 0.4;
        for (let p = 0; p < particlesPerStream; p++) {
            const phase = (progress + p / particlesPerStream) % 1;
            const dist = radius * (1 - phase * 0.85);
            const spiralAngle = baseAngle + phase * Math.PI * 1.2;
            const x = Math.cos(spiralAngle) * dist;
            const y = Math.sin(spiralAngle) * dist;
            const alpha = Math.max(0, alphaMul * 0.5 * (1 - phase));
            const dotR = 2 + (1 - phase) * 1.5;
            g.circle(x, y, dotR);
            g.fill({ color, alpha });
        }
        const tailPhase = (progress + 0.5) % 1;
        const tailDist = radius * (1 - tailPhase * 0.9);
        const tailAngle = baseAngle + tailPhase * Math.PI * 1.2;
        const tailX = Math.cos(tailAngle) * tailDist;
        const tailY = Math.sin(tailAngle) * tailDist;
        const headX = Math.cos(tailAngle) * Math.max(0, tailDist - radius * 0.18);
        const headY = Math.sin(tailAngle) * Math.max(0, tailDist - radius * 0.18);
        g.moveTo(tailX, tailY);
        g.lineTo(headX, headY);
        g.stroke({ color, width: 1.5, alpha: Math.max(0, alphaMul * 0.35 * (1 - tailPhase)) });
    }

    g.circle(0, 0, radius * 0.12);
    g.stroke({ color, width: 2, alpha: alphaMul * (0.35 + Math.sin(progress * Math.PI * 2) * 0.15) });
}

function drawLiftColumn(
    g: Graphics,
    progress: number,
    radius: number,
    color: number,
): void {
    const columnHeight = radius * 2.2;
    const baseAlpha = 0.28 + Math.sin(progress * Math.PI * 2) * 0.08;
    g.rect(-radius * 0.35, -columnHeight * 0.5, radius * 0.7, columnHeight);
    g.fill({ color, alpha: baseAlpha * 0.25 });

    const wispCount = 10;
    for (let i = 0; i < wispCount; i++) {
        const phase = (progress + i / wispCount) % 1;
        const x = Math.sin(i * 1.7 + progress * Math.PI * 2) * radius * 0.35;
        const y = columnHeight * 0.45 - phase * columnHeight * 0.95;
        const wispR = radius * (0.08 + (1 - phase) * 0.12);
        const alpha = Math.max(0, 0.55 * (1 - phase));
        g.circle(x, y, wispR);
        g.fill({ color, alpha });
    }

    for (let i = 0; i < 6; i++) {
        const debrisPhase = (progress * 1.3 + i * 0.17) % 1;
        const angle = i * 1.05 + progress * 0.6;
        const x = Math.cos(angle) * radius * 0.25;
        const y = columnHeight * 0.35 - debrisPhase * columnHeight * 0.8;
        g.moveTo(x, y);
        g.lineTo(x + Math.cos(angle + 0.4) * 4, y - 6);
        g.stroke({ color, width: 1, alpha: Math.max(0, 0.4 * (1 - debrisPhase)) });
    }

    g.ellipse(0, columnHeight * 0.42, radius * 0.55, radius * 0.18);
    g.fill({ color, alpha: 0.22 });
}

/** Pulse effect: three waves of colored circles expanding and fading at different speeds. */
export const pulseEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as { colors?: number[] };
        const colors = data.colors ?? [0x8b5a2b, 0x5d4e37, 0x2d2d2d];

        // Three waves: different start phases and growth rates
        const waves = [
            { startPhase: 0, growthRate: 70, opacityRate: 1.2 },
            { startPhase: 0.12, growthRate: 90, opacityRate: 1.0 },
            { startPhase: 0.24, growthRate: 110, opacityRate: 0.9 },
        ];

        for (let i = 0; i < 3; i++) {
            const w = waves[i]!;
            const effectiveProgress = progress <= w.startPhase ? 0 : Math.min(1, (progress - w.startPhase) / (1 - w.startPhase));
            const radius = 10 + effectiveProgress * w.growthRate;
            const alpha = Math.max(0, 0.9 - effectiveProgress * w.opacityRate);
            const color = colors[i] ?? 0x5d4e37;
            g.circle(0, 0, radius);
            g.stroke({ color, width: 2, alpha });
        }
    },
};

/** Crit shockwave: compact red rings that burst from a target on a critical/bonus hit. */
export const critShockwaveEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const rings: RingPulseSpec[] = [
            { delay: 0,    startRadius: 4, endRadius: 32, width: 3,   opacityMul: 1 },
            { delay: 0.15, startRadius: 4, endRadius: 22, width: 2,   opacityMul: 0.7 },
        ];
        const colors = [0xff3333, 0xcc0000];
        drawRingBursts(g, effect.progress, colors, rings, (effectiveProgress, ring) =>
            0.9 * ring.opacityMul * (1 - effectiveProgress * 1.1),
        );
    },
};

/**
 * Enrage burst: all rings fire simultaneously with different expansion speeds.
 * Slower rings have a lower fade rate so they stay visible longer.
 */
export const enrageBurstEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const p = effect.progress;
        const rings = [
            { startR: 12, endR: 65,  width: 5,   fadeRate: 1.45 }, // fast: gone at p≈0.69
            { startR: 12, endR: 110, width: 3.5,  fadeRate: 1.0  }, // medium: gone at p=1.0
            { startR: 12, endR: 155, width: 2.5,  fadeRate: 0.78 }, // slow: fades last
        ] as const;
        const colors = [0xff5555, 0xff2222, 0xcc0000] as const;
        for (let i = 0; i < rings.length; i++) {
            const r = rings[i]!;
            const radius = r.startR + (r.endR - r.startR) * p;
            const alpha = Math.max(0, 0.88 * (1 - p * r.fadeRate));
            g.circle(0, 0, radius);
            g.stroke({ color: colors[i]!, width: r.width, alpha });
        }
    },
};

/** Howl shockwave: staggered expanding rings (sound pulse) for alpha wolf summon windup. */
export const howlShockwaveEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as { colors?: number[]; scale?: number };
        const colors = data.colors ?? [0xc4a574, 0x8b6914, 0x3d2914];
        const scale = data.scale ?? 1;
        const rings: RingPulseSpec[] = [
            { delay: 0, startRadius: 12 * scale, endRadius: 112 * scale, width: 4 * scale, opacityMul: 1 },
            { delay: 0.06, startRadius: 12 * scale, endRadius: 100 * scale, width: 3 * scale, opacityMul: 0.85 },
            { delay: 0.12, startRadius: 12 * scale, endRadius: 88 * scale, width: 2 * scale, opacityMul: 0.7 },
        ];
        drawRingBursts(g, progress, colors, rings, (effectiveProgress, ring) =>
            0.92 * ring.opacityMul * (1 - effectiveProgress * 1.05),
        );
    },
};

/** Gravity Locus field: inward streams (pull) or outward rings/cracks (push). */
export const gravityFieldEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as GravityFieldEffectData;
        const direction = data.direction ?? 'out';
        const color = data.color ?? GRAVITY_VIOLET;
        const radius = data.radius ?? effect.effectRadius ?? 60;
        const alphaMul = data.alpha ?? 1;
        if (direction === 'out') {
            drawOutwardGravityField(g, effect.progress, radius, color, alphaMul);
        } else {
            drawInwardGravityField(g, effect.progress, radius, color, alphaMul);
        }
    },
};

/** Rising dust/debris column under a lifted unit (Lift telegraph). */
export const liftColumnEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as LiftColumnEffectData;
        const color = data.color ?? GRAVITY_VIOLET;
        const radius = data.radius ?? effect.effectRadius ?? 18;
        drawLiftColumn(g, effect.progress, radius, color);
    },
};
