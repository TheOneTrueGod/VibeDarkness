/**
 * Upright conjured-weapon art for the orbit, the discard arc, and the dropped token.
 * Textures are keyed by token kind. The picture's URL comes from that weapon's `ConjuredWeaponDef.art`.
 */
import { Assets, Sprite, Texture } from 'pixi.js';
import { getConjuredWeaponDefByTokenKind } from '../conjuredWeapons/registry';

/** Square world size at scale 1. Replaces the old drawn blade, which was about this tall. */
export const SWORD_CARD_ART_PX = 38;

export const DROPPED_SWORD_SCALE = 0.4;
export const DISCARD_SWORD_SCALE = 0.45;

interface WeaponTexture {
    url: string;
    texture: Texture | null;
    load: 'idle' | 'loading' | 'failed';
}

const weaponTextures = new Map<string, WeaponTexture>();

/** Pixi URL for a dropped-weapon kind, when a registered weapon has that token kind. */
export function weaponCardArtUrl(kind: string): string | undefined {
    return getConjuredWeaponDefByTokenKind(kind)?.art.url;
}

/** Pixi needs the .svg URL. A blob of the raw markup has no extension, so Assets.load never accepts it. */
function requestWeaponCardTexture(kind: string): Texture | null {
    const url = weaponCardArtUrl(kind);
    if (!url) return null;
    let entry = weaponTextures.get(kind);
    if (!entry || entry.url !== url) {
        entry = { url, texture: null, load: 'idle' };
        weaponTextures.set(kind, entry);
    }
    if (entry.texture) return entry.texture;
    if (entry.load === 'idle') {
        const art = entry;
        art.load = 'loading';
        void (Assets.load(art.url) as Promise<Texture>).then((loaded) => {
            art.texture = loaded;
        }).catch(() => {
            art.load = 'failed';
        });
    }
    return entry.texture;
}

export function createWeaponCardSprite(kind: string): Sprite {
    const sprite = new Sprite(requestWeaponCardTexture(kind) ?? Texture.EMPTY);
    sprite.anchor.set(0.5, 0.5);
    return sprite;
}

export function syncWeaponCardTexture(sprite: Sprite, kind: string): void {
    const texture = requestWeaponCardTexture(kind);
    if (texture && sprite.texture !== texture) sprite.texture = texture;
}

export function sizeWeaponCardSprite(sprite: Sprite, scale: number): void {
    const px = SWORD_CARD_ART_PX * scale;
    sprite.width = px;
    sprite.height = px;
}
