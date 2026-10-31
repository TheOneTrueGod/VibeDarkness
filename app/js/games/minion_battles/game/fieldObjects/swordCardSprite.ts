/**
 * Upright conjured-weapon art for the orbit, the discard arc, and the dropped token.
 * The sword helpers are the Charge Sword picture. A mace or shield uses the same helpers by kind.
 */
import { Assets, Sprite, Texture } from 'pixi.js';
import {
    DROPPED_WEAPON_KIND_MACE,
    DROPPED_WEAPON_KIND_SHIELD,
    DROPPED_WEAPON_KIND_SWORD,
} from '../../card_defs/10_armory_core/armoryConstants';
import swordCardUrl from '../../card_defs/10_armory_core/chargeSword.svg';
import maceCardUrl from '../../card_defs/10_armory_core/chargeMace.svg';
import shieldCardUrl from '../../card_defs/10_armory_core/shield.svg';

/** Square world size at scale 1. Replaces the old drawn blade, which was about this tall. */
export const SWORD_CARD_ART_PX = 38;

export const DROPPED_SWORD_SCALE = 0.4;
export const DISCARD_SWORD_SCALE = 0.45;

interface WeaponArt {
    url: string;
    texture: Texture | null;
    load: 'idle' | 'loading' | 'failed';
}

const weaponArts = new Map<string, WeaponArt>();

function registerWeaponArt(kind: string, url: string): void {
    weaponArts.set(kind, { url, texture: null, load: 'idle' });
}

registerWeaponArt(DROPPED_WEAPON_KIND_SWORD, swordCardUrl);
registerWeaponArt(DROPPED_WEAPON_KIND_MACE, maceCardUrl);
registerWeaponArt(DROPPED_WEAPON_KIND_SHIELD, shieldCardUrl);

/** Pixi URL for a dropped-weapon kind, when that kind has card art. */
export function weaponCardArtUrl(kind: string): string | undefined {
    return weaponArts.get(kind)?.url;
}

/** Pixi needs the .svg URL. A blob of the raw markup has no extension, so Assets.load never accepts it. */
function requestWeaponCardTexture(kind: string): Texture | null {
    const art = weaponArts.get(kind);
    if (!art) return null;
    if (art.texture) return art.texture;
    if (art.load === 'idle') {
        art.load = 'loading';
        void (Assets.load(art.url) as Promise<Texture>).then((loaded) => {
            art.texture = loaded;
        }).catch(() => {
            art.load = 'failed';
        });
    }
    return art.texture;
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

export function createSwordCardSprite(): Sprite {
    return createWeaponCardSprite(DROPPED_WEAPON_KIND_SWORD);
}

export function syncSwordCardTexture(sprite: Sprite): void {
    syncWeaponCardTexture(sprite, DROPPED_WEAPON_KIND_SWORD);
}

export function sizeSwordCardSprite(sprite: Sprite, scale: number): void {
    const px = SWORD_CARD_ART_PX * scale;
    sprite.width = px;
    sprite.height = px;
}
