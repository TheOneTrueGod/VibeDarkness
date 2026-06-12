/**
 * SpriteEffectDef — named, data-driven visual definitions for sprite-based effects.
 *
 * Each entry describes how a one-shot sprite looks: which texture to use (by EffectImageKey),
 * duration, scale behaviour, fade, rotation, and tint. The generic `SpriteEffect` effectDef in
 * index.ts reads the `defId` from effectData and delegates all rendering to the def here.
 *
 * Motion (velocity, acceleration) is still passed via effectData and handled by Effect.ts,
 * just as for ParticleImage — the def only governs appearance.
 */

import { Assets, Container, Sprite, Texture } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import type { EffectImageKey } from '../effectImages';

// ---- SpriteEffectDef interface ----

export interface SpriteEffectDef {
    /** EffectImageKey for the sprite texture (loaded via AssetRegistry). */
    texture?: string;
    /**
     * Inline SVG source string. Loaded asynchronously via Assets.load the first time it is
     * requested, then cached. Returns empty texture on the first frame until loading completes.
     */
    svg?: string;
    /** Duration in seconds. */
    duration: number;
    /**
     * Scale of the sprite in world pixels. When an object `{ from, to }` is given the scale
     * is linearly interpolated from `from` at progress=0 to `to` at progress=1.
     * Default: 18 px (matches the legacy ParticleImage size).
     */
    scale?: number | { from: number; to: number };
    /** When true, alpha fades from 1 to 0 over the lifetime. Default: false. */
    fadeOut?: boolean;
    /**
     * Rotation in radians. 'random' picks a fixed random angle at visual-create time;
     * 'aim' uses the aimAngle stored in effectData. A numeric value is a fixed angle.
     * Default: 0.
     */
    rotation?: number | 'random' | 'aim';
    /** Colour tint applied to the sprite (0xRRGGBB). Default: 0xffffff (no tint). */
    tint?: number;
}

// ---- Named def registry ----

/**
 * Named SpriteEffect definitions. Keyed by the defId stored in effectData.
 * Add new entries here to define additional named sprite effects.
 */
export const SPRITE_EFFECT_DEFS: Record<string, SpriteEffectDef> = {
    /**
     * Compact dark-blob burst particle: fades out over 0.45 s with slight scale shrink.
     * Used by AlphaWolfSummon and similar dark-creature summon bursts.
     * Pass a numeric `rotation` override from the caller site for per-particle random rotation.
     */
    darkBlobBurst: {
        texture: 'darkBlob',
        duration: 0.45,
        scale: { from: 12, to: 6 },
        fadeOut: true,
        tint: 0x9933cc,
    },
};

// ---- SVG cache ----

const svgTextureCache = new Map<string, Texture | 'loading'>();

function getSvgTexture(svg: string): Texture | null {
    const cached = svgTextureCache.get(svg);
    if (cached === 'loading') return null;
    if (cached instanceof Texture) return cached;

    svgTextureCache.set(svg, 'loading');
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    (Assets.load(url) as Promise<Texture>).then((tex: Texture) => {
        svgTextureCache.set(svg, tex);
        URL.revokeObjectURL(url);
    }).catch(() => {
        svgTextureCache.delete(svg);
    });
    return null;
}

// ---- Generic SpriteEffect IEffectDef ----

/**
 * Generic effectDef for all SpriteEffect instances.
 * Reads `defId` from effectData, looks it up in SPRITE_EFFECT_DEFS, and renders accordingly.
 * Per-call overrides (tint, scale, rotation) can be supplied via effectData alongside defId.
 */
export const spriteEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const data = effect.effectData as SpriteEffectData;
        const def = SPRITE_EFFECT_DEFS[data.defId ?? ''];
        const texture = resolveTexture(def, context);
        const sprite = new Sprite(texture ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 0.5);

        // Resolve initial rotation.
        // Note: Math.random() is forbidden in game/ for determinism. Callers that want
        // random rotation must pre-compute the angle in card_defs/** and pass it as a
        // numeric `rotation` override to spawnSpriteEffect. The 'random' sentinel is
        // kept in the type for documentation but treated as 0 here.
        const rotation = data.rotationOverride ?? def?.rotation ?? 0;
        if (rotation === 'aim') {
            sprite.rotation = data.aimAngle ?? 0;
        } else if (typeof rotation === 'number') {
            sprite.rotation = rotation;
        }
        // 'random': treated as 0 — caller should have passed a numeric override.

        return sprite;
    },

    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const sprite = visual as Sprite;
        const data = effect.effectData as SpriteEffectData;
        const def = SPRITE_EFFECT_DEFS[data.defId ?? ''];
        if (!def) return;

        // Texture: re-resolve each frame in case an async SVG just finished loading.
        const tex = resolveTexture(def, context);
        if (tex && sprite.texture !== tex) sprite.texture = tex;

        const p = effect.progress;

        // Scale: use per-call override first, then def, then default 18 px.
        const scaleDef: SpriteEffectDef['scale'] = data.scaleOverride ?? def.scale ?? 18;
        const sizeTarget =
            typeof scaleDef === 'number'
                ? scaleDef
                : scaleDef.from + (scaleDef.to - scaleDef.from) * p;
        sprite.width = sizeTarget;
        sprite.height = sizeTarget;

        // Alpha: fade-out if requested.
        const fadeOut = data.fadeOutOverride ?? def.fadeOut ?? false;
        sprite.alpha = fadeOut ? Math.max(0, 1 - p) : 1;

        // Tint: per-call override beats def default.
        const tint: number = data.tintOverride ?? def.tint ?? 0xffffff;
        sprite.tint = tint;

        // 'aim' rotation: update from aimAngle each frame. Other rotation modes were set
        // once in createVisual and should not be overwritten here.
        const rotation = data.rotationOverride ?? def.rotation ?? 0;
        if (rotation === 'aim') {
            sprite.rotation = data.aimAngle ?? 0;
        }
    },
};

// ---- Internal helpers ----

/** Effectdata shape for SpriteEffect instances. */
interface SpriteEffectData {
    defId?: string;
    /** Per-call overrides (optional). */
    tintOverride?: number;
    scaleOverride?: SpriteEffectDef['scale'];
    fadeOutOverride?: boolean;
    rotationOverride?: SpriteEffectDef['rotation'];
    aimAngle?: number;
    /** Motion fields (handled by Effect.ts renderUpdate, not the def). */
    vx?: number;
    vy?: number;
    ay?: number;
    dampingK?: number;
}

function resolveTexture(def: SpriteEffectDef | undefined, context: IEffectRenderContext): Texture | null {
    if (!def) return null;
    if (def.texture) return context.getEffectTexture(def.texture as EffectImageKey);
    if (def.svg) return getSvgTexture(def.svg);
    return null;
}
