/**
 * Card art for Create Sword, Improvised Sword, and Throw Sword.
 * The conjure shrink, the discard arc, and the dropped token all use this image.
 */
import { Assets, Sprite, Texture } from 'pixi.js';
import swordCardUrl from '../../character_defs/items/assets/013_sword.svg';

/** Square world size at scale 1. Replaces the old drawn blade, which was about this tall. */
export const SWORD_CARD_ART_PX = 38;

export const CONJURE_SWORD_SCALE_START = 1.8;
export const CONJURE_SWORD_SCALE_END = 0.15;
export const DROPPED_SWORD_SCALE = 0.4;
export const DISCARD_SWORD_SCALE = 0.45;

let swordCardTexture: Texture | null = null;
let swordCardLoad: 'idle' | 'loading' | 'failed' = 'idle';

/** Pixi needs the .svg URL. A blob of the raw markup has no extension, so Assets.load never accepts it. */
function requestSwordCardTexture(): Texture | null {
    if (swordCardTexture) return swordCardTexture;
    if (swordCardLoad === 'idle') {
        swordCardLoad = 'loading';
        void (Assets.load(swordCardUrl) as Promise<Texture>).then((loaded) => {
            swordCardTexture = loaded;
        }).catch(() => {
            swordCardLoad = 'failed';
        });
    }
    return swordCardTexture;
}

export function createSwordCardSprite(): Sprite {
    const sprite = new Sprite(requestSwordCardTexture() ?? Texture.EMPTY);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
}

export function syncSwordCardTexture(sprite: Sprite): void {
    const texture = requestSwordCardTexture();
    if (texture && sprite.texture !== texture) sprite.texture = texture;
}

export function sizeSwordCardSprite(sprite: Sprite, scale: number): void {
    const px = SWORD_CARD_ART_PX * scale;
    sprite.width = px;
    sprite.height = px;
}
