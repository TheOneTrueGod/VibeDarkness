import { Container, Sprite, Texture } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';
import { getLoadedSpriteTexture } from '../projectiles/projectile_defs/spriteProjectileDef';
import type { SpriteAfterimageEffectData } from '../projectiles/projectile_defs/spriteAfterimage';

/** SpriteAfterimage: a still copy of a sprite projectile's first frame that fades out. Motion comes from the Effect. */
export const spriteAfterimageEffectDef: IEffectDef = {
    createVisual(effect: Effect, _context: IEffectRenderContext): Container {
        const data = effect.effectData as unknown as SpriteAfterimageEffectData;
        const sprite = new Sprite(getLoadedSpriteTexture(data.sprite) ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 0.5);
        if (data.sprite.scale !== undefined) sprite.scale.set(data.sprite.scale);
        sprite.rotation = data.rotation;
        if (data.tint !== undefined) sprite.tint = data.tint;
        return sprite;
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const data = effect.effectData as unknown as SpriteAfterimageEffectData;
        visual.alpha = Math.max(0, data.initialAlpha * (1 - effect.progress));
    },
};
