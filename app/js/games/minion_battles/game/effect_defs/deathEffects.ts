import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import type { EffectImageKey } from '../effectImages';
import {
    DARK_CREATURE_CORRUPTION_TINT,
    DARK_CREATURE_DEATH_ICON_TINT_ALPHA,
    DARK_CREATURE_ICON_TINT_ALPHA,
} from '../deathEffects/darkCreatureVisualConstants';
import { CHARACTER_SPRITE_SCALE } from '../units/unit_defs/unitDef';

/** Quick dark-creature death: tinted icon, lateral shake, top-to-bottom wipe. Particles spawned by a companion IntervalEmitter. */
export const darkCreatureIconDeathEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const data = effect.effectData as { characterSpriteKey?: string; displayRadius?: number };
        const key = data.characterSpriteKey ?? 'dark_wolf';
        const tex = context.getCharacterTexture?.(key) ?? Texture.EMPTY;
        const radius = data.displayRadius ?? 14;
        const spriteSize = radius * 2 * CHARACTER_SPRITE_SCALE;

        const root = new Container();
        const shake = new Container();
        shake.label = 'darkCreatureDeathShake';
        const masked = new Container();
        masked.label = 'darkCreatureDeathMasked';
        const base = new Sprite(tex);
        base.anchor.set(0.5, 0.5);
        base.width = spriteSize;
        base.height = spriteSize;
        base.label = 'deathIconBase';
        const tint = new Sprite(tex);
        tint.anchor.set(0.5, 0.5);
        tint.width = spriteSize;
        tint.height = spriteSize;
        tint.blendMode = 'multiply';
        tint.tint = DARK_CREATURE_CORRUPTION_TINT;
        tint.alpha = DARK_CREATURE_DEATH_ICON_TINT_ALPHA;
        tint.label = 'deathIconTint';
        masked.addChild(base, tint);
        const maskG = new Graphics();
        maskG.label = 'darkCreatureDeathMask';
        masked.mask = maskG;
        shake.addChild(masked, maskG);
        root.addChild(shake);
        return root;
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const data = effect.effectData as { characterSpriteKey?: string; displayRadius?: number };
        const key = data.characterSpriteKey ?? 'dark_wolf';
        const tex = context.getCharacterTexture?.(key);
        const shake = visual.children.find((c) => c.label === 'darkCreatureDeathShake') as Container | undefined;
        if (!shake) return;
        const masked = shake.children.find((c) => c.label === 'darkCreatureDeathMasked') as Container | undefined;
        const maskG = shake.children.find((c) => c.label === 'darkCreatureDeathMask') as Graphics | undefined;
        const base = masked?.children.find((c) => c.label === 'deathIconBase') as Sprite | undefined;
        const tintSpr = masked?.children.find((c) => c.label === 'deathIconTint') as Sprite | undefined;
        if (tex && base && base.texture !== tex) {
            base.texture = tex;
            if (tintSpr) tintSpr.texture = tex;
        }
        const p = effect.progress;
        const hz = 26;
        shake.x = Math.sin(effect.elapsed * Math.PI * 2 * hz) * 2.8;
        if (masked) masked.alpha = 1 - p * 0.15;
        const radius = data.displayRadius ?? 14;
        const fallbackSize = radius * 2 * CHARACTER_SPRITE_SCALE;
        const h = base?.height ?? fallbackSize;
        const w = base?.width ?? fallbackSize;
        if (maskG) {
            maskG.clear();
            const top = -h / 2 + h * p;
            const visH = Math.max(0.5, h * (1 - p));
            maskG.rect(-w / 2, top, w, visH);
            maskG.fill({ color: 0xffffff });
        }
    },
};

/** Alpha wolf story remnant: boss icon with corruption tint, shakes and wipes top-to-bottom. */
export const alphaWolfStoryRemnantEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const data = effect.effectData as { remnantCharacterKey?: string };
        const key = data.remnantCharacterKey ?? 'alpha_wolf';
        const texture = context.getCharacterTexture?.(key) ?? Texture.EMPTY;
        const root = new Container();
        root.label = 'storyRemnantRoot';
        const shake = new Container();
        shake.label = 'storyRemnantShake';
        const masked = new Container();
        masked.label = 'storyRemnantMasked';
        const base = new Sprite(texture);
        base.anchor.set(0.5, 0.5);
        base.width = 42;
        base.height = 42;
        base.label = 'storyRemnantBase';
        const tint = new Sprite(texture);
        tint.anchor.set(0.5, 0.5);
        tint.width = 42;
        tint.height = 42;
        tint.blendMode = 'multiply';
        tint.tint = DARK_CREATURE_CORRUPTION_TINT;
        tint.alpha = DARK_CREATURE_ICON_TINT_ALPHA;
        tint.label = 'storyRemnantTint';
        masked.addChild(base, tint);
        const maskG = new Graphics();
        maskG.label = 'storyRemnantMask';
        masked.mask = maskG;
        shake.addChild(masked, maskG);
        root.addChild(shake);
        return root;
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const data = effect.effectData as { remnantCharacterKey?: string; shakeFrequencyHz?: number; shakeAmplitudePx?: number };
        const key = data.remnantCharacterKey ?? 'alpha_wolf';
        const tex = context.getCharacterTexture?.(key);
        const shake = visual.children.find((c) => c.label === 'storyRemnantShake') as Container | undefined;
        const masked = shake?.children.find((c) => c.label === 'storyRemnantMasked') as Container | undefined;
        const maskG = shake?.children.find((c) => c.label === 'storyRemnantMask') as Graphics | undefined;
        const base = masked?.children.find((c) => c.label === 'storyRemnantBase') as Sprite | undefined;
        const tint = masked?.children.find((c) => c.label === 'storyRemnantTint') as Sprite | undefined;
        if (tex && base && base.texture !== tex) {
            base.texture = tex;
            if (tint) tint.texture = tex;
        }
        const hz = data.shakeFrequencyHz ?? 7;
        const amp = data.shakeAmplitudePx ?? 2;
        if (shake) shake.x = Math.sin(effect.elapsed * Math.PI * 2 * hz) * amp;
        const p = effect.progress;
        const h = base?.height ?? 42;
        const w = base?.width ?? 42;
        if (maskG) {
            maskG.clear();
            const top = -h / 2 + h * p;
            const visH = Math.max(0.5, h * (1 - p));
            maskG.rect(-w / 2, top, w, visH);
            maskG.fill({ color: 0xffffff });
        }
    },
};

/** Purple homing particle that travels from wolf remnant to player targets. */
export const storyHomingParticleEffectDef: IEffectDef = {
    createVisual(effect: Effect, context: IEffectRenderContext): Container {
        const data = effect.effectData as { imageKey?: EffectImageKey };
        const texture = data.imageKey ? context.getEffectTexture(data.imageKey) : null;
        const sprite = new Sprite(texture ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 0.5);
        sprite.tint = 0xa855f7;
        sprite.width = 16;
        sprite.height = 16;
        return sprite;
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const sprite = visual as Sprite;
        const data = effect.effectData as { imageKey?: EffectImageKey };
        if (data.imageKey) {
            const tex = context.getEffectTexture(data.imageKey);
            if (tex && sprite.texture !== tex) sprite.texture = tex;
        }
        sprite.tint = 0xa855f7;
        const life = Math.max(0.35, 1 - effect.progress * 0.4);
        sprite.alpha = life;
        const size = 14 + (1 - effect.progress) * 6;
        sprite.width = size;
        sprite.height = size;
    },
};

/** Particle image: sprite that fades and scales down over its lifetime. */
export const particleImageEffectDef: IEffectDef = {
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
