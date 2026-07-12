import { Container, FillGradient, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

/**
 * Blood Mage effect visuals: black+red, always blended/misty — never a stark two-tone split.
 * See `card_defs/03_blood_mage/AGENTS.md` for the full visual-identity rationale; the mist
 * helpers that spawn these live in `abilities/bloodMageVfx.ts`.
 */

export const BLOOD_MIST_BURST_EFFECT_TYPE = 'BloodMistBurst';
export const BLOOD_MIST_IMPACT_EFFECT_TYPE = 'BloodMistImpact';
export const BLOOD_CONE_FLASH_EFFECT_TYPE = 'BloodConeFlash';

/** Shared base tones every Blood Mage effect blends together (see AGENTS.md). */
export const BLOOD_MIST_BLACK = 0x1a0508;
export const BLOOD_MIST_RED = 0x8b1220;

export interface BloodMistEffectData {
    /** Accent tone layered over the shared black mist base; defaults to BLOOD_MIST_RED. */
    color?: number;
}

/** Swirling mist blobs (black underlayer + red accent, layered rather than flat-filled) —
 * used both for the caster windup burst and as the traveling mist between caster and target. */
export const bloodMistBurstEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as BloodMistEffectData;
        const accent = data.color ?? BLOOD_MIST_RED;
        const progress = effect.progress;
        const baseRadius = effect.effectRadius ?? 16;
        const blobCount = 6;
        for (let i = 0; i < blobCount; i++) {
            const angle = (i / blobCount) * Math.PI * 2 + progress * Math.PI * 1.4;
            const orbit = baseRadius * (0.35 + 0.5 * Math.sin(progress * Math.PI + i));
            const px = Math.cos(angle) * orbit;
            const py = Math.sin(angle) * orbit;
            const blobR = baseRadius * (0.3 + 0.15 * Math.sin(i * 1.7 + progress * 4));
            const alpha = Math.max(0, 0.4 * (1 - progress));
            // Black underlayer first, red accent on top at lower alpha — the overlap is what
            // reads as "blended mist" rather than a hard-edged two-tone shape.
            g.circle(px, py, blobR);
            g.fill({ color: BLOOD_MIST_BLACK, alpha: alpha * 0.9 });
            g.circle(px, py, blobR * 0.7);
            g.fill({ color: accent, alpha: alpha * 0.65 });
        }
    },
};

/** Themed landing flash: concentric black/red rings blending outward, fading over duration.
 * `variant` ('heal' | 'burst' | 'shield') only affects the accent color passed via effectData —
 * the shape is shared across all three Blood Mage abilities. */
export const bloodMistImpactEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as BloodMistEffectData;
        const accent = data.color ?? BLOOD_MIST_RED;
        const progress = effect.progress;
        const radius = (effect.effectRadius ?? 18) * (0.55 + progress * 0.85);
        const alpha = Math.max(0, 0.65 * (1 - progress));

        g.circle(0, 0, radius);
        g.fill({ color: BLOOD_MIST_BLACK, alpha: alpha * 0.75 });
        g.circle(0, 0, radius * 0.7);
        g.fill({ color: accent, alpha });
        g.circle(0, 0, radius * 0.35);
        g.fill({ color: accent, alpha: Math.min(1, alpha * 1.2) });
    },
};

/** Cone flash for Burst (0302): copy of `impactEffects.ts`'s `coneFlashEffectDef` draw logic,
 * but with a blended black->red->black gradient fill instead of the flat, hardcoded
 * `CONE_FLASH_TEAL` — Cone of Light's constant is not parametrized, so this is a dedicated def
 * rather than a shared one. effectData: centerAngle, halfArcRad, innerR, outerR. */
export const bloodConeFlashEffectDef: IEffectDef = {
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
        const alpha = Math.max(0, 0.28 * (1 - progress));

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
        // Blended gradient (black -> red -> black) rather than a flat fill, so the cone reads
        // misty/blended even as a single solid shape.
        const gradient = new FillGradient({
            type: 'linear',
            start: { x: 0, y: 0 },
            end: { x: 1, y: 1 },
            colorStops: [
                { offset: 0, color: BLOOD_MIST_BLACK },
                { offset: 0.5, color: BLOOD_MIST_RED },
                { offset: 1, color: BLOOD_MIST_BLACK },
            ],
            textureSpace: 'local',
        });
        g.fill({ fill: gradient, alpha });
    },
};
