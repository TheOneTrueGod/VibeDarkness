import type { Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { EffectImageKey } from '../effectImages';
import type { Texture as TextureType } from 'pixi.js';

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
