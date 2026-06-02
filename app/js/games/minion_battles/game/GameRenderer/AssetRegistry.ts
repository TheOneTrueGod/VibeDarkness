import type { Texture } from 'pixi.js';
import type { EffectImageKey } from '../effectImages';

export class AssetRegistry {
    // TODO: migrate all texture fields from GameRenderer:
    //   slimeTexture, swordwomanTexture, wolfHeadTexture, wolfHowlTexture,
    //   boarTexture, lanterniteTexture, lanterniteNestTexture, campfireTexture,
    //   effectTextures, playerPortraitTextures
    // TODO: migrate loadBattleAssets() from GameRenderer

    getCharacterTexture(_characterId: string): Texture | null { return null; }
    getPlayerPortraitTexture(_portraitId: string): Texture | null { return null; }
    getEffectTexture(_key: EffectImageKey): Texture | null { return null; }

    async load(): Promise<void> {
        // TODO: implement
    }

    destroy(): void {
        // TODO: destroy all cached textures
    }
}
