/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { FillGradient, Graphics, Sprite, Texture, type Container, type Texture as TextureType } from 'pixi.js';
import type { Effect } from '../objects/Effect';
import type { EffectImageKey } from './effectImages';

/** Effect definition: responsible for drawing one effect type. */
export interface IEffectDef {
    /** Create the Pixi visual for this effect. */
    createVisual(effect: Effect, context: IEffectRenderContext): Container;
    /** Update the visual each frame (clear and redraw based on effect state). */
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void;
}

export interface IEffectRenderContext {
    getEffectTexture(imageKey: EffectImageKey): TextureType | null;
}

/** Default effect: expanding ring that fades out. */
const defaultEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const alpha = 1 - effect.progress;
        const radius = 10 + effect.progress * 30;
        g.circle(0, 0, radius);
        g.stroke({ color: 0xffd700, width: 2, alpha });
    },
};

/** Bash effect: 9-pointed star with left-to-right gradient fill, black border, grows over duration. */
const bashEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const baseSize = 12;
        const size = baseSize + progress * 4;
        const alpha = 0.55;

        const outerRadius = size / 2;
        const innerRadius = size / 4;
        const points: { x: number; y: number }[] = [];
        for (let i = 0; i < 9; i++) {
            const outerAngle = (i * 2 * Math.PI) / 9 - Math.PI / 2;
            points.push({
                x: Math.cos(outerAngle) * outerRadius,
                y: Math.sin(outerAngle) * outerRadius,
            });
            const innerAngle = ((i + 0.5) * 2 * Math.PI) / 9 - Math.PI / 2;
            points.push({
                x: Math.cos(innerAngle) * innerRadius,
                y: Math.sin(innerAngle) * innerRadius,
            });
        }

        const flatPoints = points.flatMap((p) => [p.x, p.y]);
        g.poly(flatPoints, true);
        const gradient = new FillGradient({
            type: 'linear',
            start: { x: 0, y: 0.5 },
            end: { x: 1, y: 0.5 },
            colorStops: [
                { offset: 0, color: 0x808090 },
                { offset: 0.5, color: 0xc0c0d0 },
                { offset: 1, color: 0xf0f0f8 },
            ],
            textureSpace: 'local',
        });
        g.fill({ fill: gradient, alpha });
        g.stroke({ color: 0x000000, width: 1, alpha: 1 });
    },
};

/** Bite effect: 4-frame animation of two sets of fangs closing (front view), animal bite. */
const biteEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const size = effect.effectRadius ?? 10;
        // 4 frames: fangs open (0) -> closed (1). Two V-shapes (top and bottom) closing toward center.
        const openAmount = (1 - progress) * size * 0.8; // how far the jaws are open
        const alpha = 0.9 - progress * 0.5;

        // Top fangs: two lines from above meeting toward center
        const topY = -openAmount;
        const bottomY = openAmount;
        const centerX = 0;
        const leftX = -size * 0.6;
        const rightX = size * 0.6;
        const tipY = 0; // meeting point when closed

        // Top jaw: left and right fangs coming down
        const topLeftTipY = topY + (tipY - topY) * progress;
        const topRightTipY = topY + (tipY - topY) * progress;
        g.moveTo(leftX, topY);
        g.lineTo(centerX - size * 0.2, topLeftTipY);
        g.moveTo(rightX, topY);
        g.lineTo(centerX + size * 0.2, topRightTipY);

        // Bottom jaw: left and right fangs coming up
        const bottomLeftTipY = bottomY - (bottomY - tipY) * progress;
        const bottomRightTipY = bottomY - (bottomY - tipY) * progress;
        g.moveTo(leftX, bottomY);
        g.lineTo(centerX - size * 0.2, bottomLeftTipY);
        g.moveTo(rightX, bottomY);
        g.lineTo(centerX + size * 0.2, bottomRightTipY);

        g.stroke({ color: 0xffffff, width: 2, alpha });
        g.stroke({ color: 0x444444, width: 1, alpha: alpha * 0.8 });
    },
};

/** Corruption orb: purple orb that moves from unit toward defend point. */
const corruptionOrbEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const alpha = 0.9 - effect.progress * 0.4;
        g.circle(0, 0, 6);
        g.fill({ color: 0x663399, alpha });
        g.stroke({ color: 0x9966cc, width: 1, alpha });
    },
};

/** Purple progress bar showing corruption progress (0..1) toward next HP damage. */
const corruptionProgressBarDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = (effect.effectData as { progress?: number }).progress ?? 0;
        const w = 24;
        const h = 4;
        g.rect(-w / 2, -20, w, h);
        g.fill({ color: 0x332244 });
        g.rect(-w / 2, -20, w * progress, h);
        g.fill({ color: 0x663399 });
        g.rect(-w / 2, -20, w, h);
        g.stroke({ color: 0x9966cc, width: 1 });
    },
};

/** Flying torch projectile: brown stick with red circle, spins as it travels. */
const torchProjectileEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        // Spin based on progress (full rotation every ~0.15s of a 0.5s flight = ~3 rotations)
        const spin = (effect.elapsed / 0.15) * Math.PI * 2;
        const stickLen = 10;
        const stickHalf = stickLen / 2;
        // Brown stick (rotates around center)
        const cx = Math.cos(spin) * stickHalf;
        const sy = Math.sin(spin) * stickHalf;
        const perpX = -Math.sin(spin) * 2;
        const perpY = Math.cos(spin) * 2;
        const stickPoints = [
            -cx + perpX, -sy + perpY,
            cx + perpX, sy + perpY,
            cx - perpX, sy - perpY,
            -cx - perpX, -sy - perpY,
        ];
        g.poly(stickPoints, true);
        g.fill({ color: 0x5c4033 });
        g.stroke({ color: 0x3d2b1f, width: 1 });
        // Red circle (flame end) at front of stick
        const tipX = Math.cos(spin) * stickHalf;
        const tipY = Math.sin(spin) * stickHalf;
        g.circle(tipX, tipY, 5);
        g.fill({ color: 0xcc3300 });
        g.stroke({ color: 0x990000, width: 1 });
    },
};

/** Torch on the ground: small flame glow, emits light (handled in light grid). */
const torchEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as { lightAmount?: number; radius?: number };
        const lightAmount = data.lightAmount ?? 15;
        const radius = data.radius ?? 5;
        const size = Math.max(8, Math.min(20, radius * 4));
        g.circle(0, 0, size);
        g.fill({ color: 0xffaa40, alpha: 0.4 + (lightAmount / 15) * 0.4 });
        g.circle(0, 0, size * 0.6);
        g.fill({ color: 0xffdd00, alpha: 0.5 });
        g.stroke({ color: 0xff6600, width: 1, alpha: 0.8 });
    },
};

/** Particle image: sprite that fades and scales down over its lifetime. */
const particleImageEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const data = effect.effectData as { imageKey?: EffectImageKey };
        const texture = data.imageKey ? context.getEffectTexture(data.imageKey) : null;
        const sprite = new Sprite(texture ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 0.5);
        sprite.width = 18;
        sprite.height = 18;
        return sprite;
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const sprite = visual as Sprite;
        const data = effect.effectData as { imageKey?: EffectImageKey; scale?: number };
        if (data.imageKey) {
            const tex = context.getEffectTexture(data.imageKey);
            if (tex && sprite.texture !== tex) sprite.texture = tex;
        }
        const life = 1 - effect.progress;
        sprite.alpha = life * life;
        const base = (data.scale ?? 1) * 18;
        const s = base * (0.6 + 0.4 * life);
        sprite.width = s;
        sprite.height = s;
    },
};

const effectDefRegistry: Record<string, IEffectDef> = {
    default: defaultEffectDef,
    bash: bashEffectDef,
    bite: biteEffectDef,
    CorruptionOrb: corruptionOrbEffectDef,
    CorruptionProgressBar: corruptionProgressBarDef,
    TorchProjectile: torchProjectileEffectDef,
    Torch: torchEffectDef,
    ParticleImage: particleImageEffectDef,
};

/** Get the effect def for an effect type. Falls back to default. */
export function getEffectDef(effectType: string): IEffectDef {
    return effectDefRegistry[effectType] ?? defaultEffectDef;
}

/**
 * Create an effect visual. Uses the effect's effectType to look up the EffectDef and delegates drawing.
 */
export function createEffectVisual(effect: Effect, context: IEffectRenderContext): Container {
    const def = getEffectDef(effect.effectType);
    return def.createVisual(effect, context);
}

/**
 * Update an effect visual for the current frame. Call each frame from GameRenderer.
 */
export function updateEffectVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
    const def = getEffectDef(effect.effectType);
    def.updateVisual(visual, effect, context);
}
