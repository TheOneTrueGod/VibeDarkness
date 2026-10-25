import { Assets, Texture } from 'pixi.js';
import type { EffectImageKey } from '../effectImages';
import { EFFECT_IMAGE_SOURCES } from '../effectImages';
import { getSpecialTileDef } from '../../storylines/specialTileDefs';
import { UNIT_SPRITE_URLS } from '../units/unit_defs/unitSprites';
import { getPortraitIds, PORTRAITS } from '../../character_defs/portraitLoader';


export class AssetRegistry {
    /** Character textures by sprite key (`UNIT_SPRITE_URLS` / `UnitDefEntry.characterSpriteKey`). */
    private characterTextures: Map<string, Texture> = new Map();
    private campfireTexture: Texture | null = null;
    private effectTextures: Partial<Record<EffectImageKey, Texture>> = {};
    private playerPortraitTextures: Map<string, Texture> = new Map();

    /** Set to true after load() completes so UnitRenderer can sync deferred character sprites. */
    pendingUnitSync: boolean = false;

    getCharacterTexture(characterId: string): Texture | null {
        return this.characterTextures.get(characterId) ?? null;
    }

    getPlayerPortraitTexture(portraitId: string): Texture | null {
        return this.playerPortraitTextures.get(portraitId) ?? null;
    }

    getEffectTexture(key: EffectImageKey): Texture | null {
        return this.effectTextures[key] ?? null;
    }

    getCampfireTexture(): Texture | null {
        return this.campfireTexture;
    }

    async load(): Promise<void> {
        const loadOne = async (label: string, url: string, assign: (t: Texture) => void): Promise<void> => {
            try {
                assign((await Assets.load(url)) as Texture);
            } catch (err) {
                console.warn('[AssetRegistry] Failed to load:', label, err);
            }
        };

        for (const [key, url] of Object.entries(UNIT_SPRITE_URLS)) {
            await loadOne(`${key} sprite`, url, (t) => { this.characterTextures.set(key, t); });
        }

        const campfireDef = getSpecialTileDef('Campfire');
        if (campfireDef?.image) {
            await loadOne('Campfire tile', campfireDef.image, (t) => { this.campfireTexture = t; });
        }

        for (const [key, src] of Object.entries(EFFECT_IMAGE_SOURCES) as [EffectImageKey, string][]) {
            try {
                this.effectTextures[key] = (await Assets.load(src)) as Texture;
            } catch (err) {
                console.warn('[AssetRegistry] Failed to load effect texture:', key, src, err);
            }
        }

        for (const portraitId of getPortraitIds()) {
            const url = PORTRAITS[portraitId]?.battleModel.modelImageUrl;
            if (!url) continue;
            try {
                const tex = (await Assets.load(url)) as Texture;
                this.playerPortraitTextures.set(portraitId, tex);
            } catch (err) {
                console.warn('[AssetRegistry] Failed to load portrait texture:', portraitId, err);
            }
        }

        this.pendingUnitSync = true;
    }

    destroy(): void {
        this.characterTextures.clear();
        this.campfireTexture = null;
        this.effectTextures = {};
        this.playerPortraitTextures.clear();
    }
}
