import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

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
