import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { GRAVITY_VIOLET } from './aoeEffects';

export const COLLISION_CLASH_EFFECT_TYPE = 'CollisionClash';
export const TERRAIN_IMPACT_EFFECT_TYPE = 'TerrainImpact';

export interface CollisionClashEffectData {
    color?: number;
}

export interface TerrainImpactEffectData {
    color?: number;
    tile?: { col: number; row: number };
    impact?: { x: number; y: number };
}

/** Punch effect: 9-pointed star with left-to-right gradient fill, black border, grows over duration. */
export const punchEffectDef: IEffectDef = {
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
export const biteEffectDef: IEffectDef = {
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

/** Light cyan color for laser/slash effects. */
export const LASER_CYAN = 0x7fdfef;

/** Slashing sword impact: 9-pointed star like punch but light cyan, grows over duration. */
export const slashingSwordEffectDef: IEffectDef = {
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

/** Cone flash: teal cone wedge that fades out. effectData: centerAngle, halfArcRad, innerR, outerR. */
const CONE_FLASH_TEAL = 0x27d3c8; // crystal colour

export const coneFlashEffectDef: IEffectDef = {
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

/** Force Push unit-vs-unit clash: bright spark burst at the impact point. */
export const collisionClashEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as CollisionClashEffectData;
        const color = data.color ?? GRAVITY_VIOLET;
        const progress = effect.progress;
        const alpha = Math.max(0, 0.95 * (1 - progress * 1.1));
        const burstRadius = 6 + progress * 22;

        g.circle(0, 0, 4 + progress * 6);
        g.fill({ color: 0xffffff, alpha: alpha * 0.85 });

        const sparkCount = 10;
        for (let i = 0; i < sparkCount; i++) {
            const angle = (i / sparkCount) * Math.PI * 2 + progress * 0.4;
            const innerR = burstRadius * 0.2;
            const outerR = burstRadius * (0.55 + (1 - progress) * 0.35);
            g.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR);
            g.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR);
            g.stroke({ color, width: 2, alpha });
        }

        if (progress < 0.35) {
            const ringAlpha = Math.max(0, 0.6 * (1 - progress / 0.35));
            g.circle(0, 0, burstRadius * 0.75);
            g.stroke({ color, width: 2.5, alpha: ringAlpha });
        }
    },
};

function drawTerrainCrackDecal(
    g: Graphics,
    offsetX: number,
    offsetY: number,
    color: number,
    progress: number,
): void {
    const half = CELL_SIZE * 0.42;
    const crackAlpha = Math.max(0, 0.65 * (1 - progress * 0.55));
    const cracks = [
        { x1: -half * 0.3, y1: -half * 0.2, x2: half * 0.55, y2: half * 0.35 },
        { x1: half * 0.15, y1: -half * 0.45, x2: -half * 0.5, y2: half * 0.25 },
        { x1: -half * 0.1, y1: half * 0.1, x2: half * 0.35, y2: -half * 0.4 },
    ];
    for (const crack of cracks) {
        g.moveTo(offsetX + crack.x1, offsetY + crack.y1);
        g.lineTo(offsetX + crack.x2, offsetY + crack.y2);
        g.stroke({ color, width: 2, alpha: crackAlpha });
    }
    g.rect(offsetX - half * 0.55, offsetY - half * 0.55, half * 1.1, half * 1.1);
    g.stroke({ color, width: 1, alpha: crackAlpha * 0.35 });
}

/** Force Push wall hit: dust/debris burst plus a short-lived crack decal on the tile. */
export const terrainImpactEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as TerrainImpactEffectData;
        const color = data.color ?? GRAVITY_VIOLET;
        const progress = effect.progress;
        const impactX = data.impact?.x ?? 0;
        const impactY = data.impact?.y ?? 0;
        const localImpactX = impactX - effect.x;
        const localImpactY = impactY - effect.y;

        const dustAlpha = Math.max(0, 0.55 * (1 - progress));
        const dustCount = 8;
        for (let i = 0; i < dustCount; i++) {
            const angle = (i / dustCount) * Math.PI * 2 - Math.PI / 2;
            const dist = 4 + progress * 18;
            const px = localImpactX + Math.cos(angle) * dist;
            const py = localImpactY + Math.sin(angle) * dist - progress * 10;
            const dotR = 2.5 + (1 - progress) * 2;
            g.circle(px, py, dotR);
            g.fill({ color, alpha: dustAlpha });
        }

        g.circle(localImpactX, localImpactY, 5 + progress * 8);
        g.fill({ color: 0xd4d4d8, alpha: dustAlpha * 0.5 });

        if (data.tile) {
            const tileCenterX = data.tile.col * CELL_SIZE + CELL_SIZE / 2;
            const tileCenterY = data.tile.row * CELL_SIZE + CELL_SIZE / 2;
            drawTerrainCrackDecal(
                g,
                tileCenterX - effect.x,
                tileCenterY - effect.y,
                color,
                progress,
            );
        }
    },
};
