/**
 * Effect definitions own how effects are drawn.
 * GameRenderer calls renderEffect to create/update effect visuals; the appropriate EffectDef does the drawing.
 */

import { Container, FillGradient, Graphics, Sprite, Texture, type Texture as TextureType } from 'pixi.js';
import type { Effect } from './effects/Effect';
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
    /** Optional: for effects that mimic unit appearance (e.g. Afterimage). */
    getCharacterTexture?(characterId: string): TextureType | null;
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

/** Punch effect: 9-pointed star with left-to-right gradient fill, black border, grows over duration. */
const punchEffectDef: IEffectDef = {
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
        const data = effect.effectData as { lightAmount?: number; radius?: number; showVisual?: boolean };
        if (data.showVisual === false) return;
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

/** Bullet trail: short-lived gray line segment that shrinks and fades out over time. */
const bulletTrailEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as { dx?: number; dy?: number };
        const dx = data.dx ?? 0;
        const dy = data.dy ?? 0;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) {
            return;
        }
        const progress = effect.progress;
        const life = 1 - progress;
        const baseRadius = effect.effectRadius ?? 3;
        const width = Math.max(0.5, baseRadius * life);
        const alpha = Math.max(0, life * life);

        g.moveTo(0, 0);
        g.lineTo(dx, dy);
        g.stroke({ color: 0xb0b0b0, width, alpha });
    },
};

/** Light cyan color for laser/slash effects. */
const LASER_CYAN = 0x7fdfef;

/** Slashing sword impact: 9-pointed star like punch but light cyan, grows over duration. */
const slashingSwordEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const baseSize = 12;
        const size = baseSize + progress * 4;
        const alpha = 0.65;

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
                { offset: 0, color: LASER_CYAN },
                { offset: 0.5, color: 0xafffff },
                { offset: 1, color: 0xdfffff },
            ],
            textureSpace: 'local',
        });
        g.fill({ fill: gradient, alpha });
        g.stroke({ color: 0x4fb8c8, width: 1, alpha: 1 });
    },
};

/** Thick fading line (slash trail): configurable color, thick stroke, fades out. */
const slashTrailEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        if (effect.delay !== undefined && effect.elapsed < effect.delay) return;
        const data = effect.effectData as { endX?: number; endY?: number; color?: number };
        const endX = data.endX ?? effect.x;
        const endY = data.endY ?? effect.y;
        const color = data.color ?? LASER_CYAN;
        const dx = endX - effect.x;
        const dy = endY - effect.y;
        const lengthSq = dx * dx + dy * dy;
        if (lengthSq === 0) return;

        const progress = effect.progress;
        const life = 1 - progress;
        const alpha = Math.max(0, life * life);
        const baseThickness = effect.effectRadius ?? 14;
        const width = Math.max(2, baseThickness * life);

        g.moveTo(0, 0);
        g.lineTo(dx, dy);
        g.stroke({ color, width, alpha });
    },
};

/** Afterimage: unit silhouette that fades out over duration. Looks like the source unit (body + optional sprite). */
const CHARACTER_SPRITE_SCALE = 0.85;

const afterimageEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const container = new Container();
        const data = effect.effectData as {
            bodyColor?: number;
            radius?: number;
            characterSpriteKey?: string;
        };
        const bodyColor = data.bodyColor ?? 0x555555;
        const radius = data.radius ?? 12;

        const body = new Graphics();
        body.circle(0, 0, radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        body.label = 'body';
        container.addChild(body);

        const characterSpriteKey = data.characterSpriteKey;
        const characterTexture =
            characterSpriteKey && context.getCharacterTexture?.(characterSpriteKey);
        if (characterTexture) {
            const spriteSize = radius * 2 * CHARACTER_SPRITE_SCALE;
            const charSprite = new Sprite(characterTexture);
            charSprite.anchor.set(0.5, 0.5);
            charSprite.width = spriteSize;
            charSprite.height = spriteSize;
            charSprite.label = 'characterSprite';
            container.addChild(charSprite);
        }

        return container;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const progress = effect.progress;
        const alpha = Math.max(0, 1 - progress);
        for (const child of visual.children) {
            child.alpha = alpha;
        }
    },
};

/** Cone flash: teal cone wedge that fades out. effectData: centerAngle, halfArcRad, innerR, outerR. */
const CONE_FLASH_TEAL = 0x27d3c8; // crystal colour

const coneFlashEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as {
            centerAngle?: number;
            halfArcRad?: number;
            innerR?: number;
            outerR?: number;
        };
        const centerAngle = data.centerAngle ?? 0;
        const halfArcRad = data.halfArcRad ?? Math.PI / 3;
        const innerR = data.innerR ?? 0;
        const outerR = data.outerR ?? 200;
        const progress = effect.progress;
        const alpha = Math.max(0, 0.2 * (1 - progress)); // 80% transparent, fade out over duration

        const startAngle = centerAngle - halfArcRad;
        const arcRad = halfArcRad * 2;
        const segments = 24;
        g.moveTo(innerR * Math.cos(startAngle), innerR * Math.sin(startAngle));
        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const a = startAngle + t * arcRad;
            g.lineTo(outerR * Math.cos(a), outerR * Math.sin(a));
        }
        for (let i = segments - 1; i >= 0; i--) {
            const t = i / segments;
            const a = startAngle + t * arcRad;
            g.lineTo(innerR * Math.cos(a), innerR * Math.sin(a));
        }
        g.lineTo(innerR * Math.cos(startAngle), innerR * Math.sin(startAngle));
        g.fill({ color: CONE_FLASH_TEAL, alpha });
    },
};

/** Charged rock explosion: solid teal circle that shrinks to 50% size over lifetime. */
const chargedRockExplosionEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const startRadius = effect.effectRadius ?? 50;
        const scale = 1 - effect.progress * 0.5;
        const radius = Math.max(1, startRadius * scale);
        const alpha = Math.max(0.2, 0.85 * (1 - effect.progress));
        g.circle(0, 0, radius);
        g.fill({ color: 0x27d3c8, alpha });
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

/** Pulse effect: three waves of colored circles expanding and fading at different speeds. */
const pulseEffectDef: IEffectDef = {
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

/** Howl shockwave: staggered expanding rings (sound pulse) for alpha wolf summon windup. */
const howlShockwaveEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const progress = effect.progress;
        const data = (effect.effectData ?? {}) as { colors?: number[] };
        const colors = data.colors ?? [0xc4a574, 0x8b6914, 0x3d2914];
        const rings = [
            { delay: 0, growth: 100, width: 4, opacityMul: 1 },
            { delay: 0.06, growth: 88, width: 3, opacityMul: 0.85 },
            { delay: 0.12, growth: 76, width: 2, opacityMul: 0.7 },
        ];
        for (let i = 0; i < rings.length; i++) {
            const r = rings[i]!;
            const effectiveProgress =
                progress <= r.delay ? 0 : Math.min(1, (progress - r.delay) / (1 - r.delay));
            const radius = 12 + effectiveProgress * r.growth;
            const alpha = Math.max(0, 0.92 * r.opacityMul * (1 - effectiveProgress * 1.05));
            const color = colors[i] ?? 0x5d4e37;
            g.circle(0, 0, radius);
            g.stroke({ color, width: r.width, alpha });
        }
    },
};

const effectDefRegistry: Record<string, IEffectDef> = {
    default: defaultEffectDef,
    Afterimage: afterimageEffectDef,
    punch: punchEffectDef,
    ConeFlash: coneFlashEffectDef,
    Pulse: pulseEffectDef,
    HowlShockwave: howlShockwaveEffectDef,
    bite: biteEffectDef,
    CorruptionOrb: corruptionOrbEffectDef,
    CorruptionProgressBar: corruptionProgressBarDef,
    TorchProjectile: torchProjectileEffectDef,
    Torch: torchEffectDef,
    ParticleImage: particleImageEffectDef,
    BulletTrail: bulletTrailEffectDef,
    SlashingSword: slashingSwordEffectDef,
    SlashTrail: slashTrailEffectDef,
    ChargedRockExplosion: chargedRockExplosionEffectDef,
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
