import { Assets, Texture } from 'pixi.js';
import type { EffectImageKey } from '../effectImages';
import { EFFECT_IMAGE_SOURCES } from '../effectImages';
import { getSpecialTileDef } from '../../storylines/specialTileDefs';
import { getPortraitIds, PORTRAITS } from '../../character_defs/portraitLoader';

const SLIME_SVG_URL = new URL('../../assets/characters/slime.svg', import.meta.url).href;
const SWORDWOMAN_SVG_URL = new URL('../../assets/characters/swordwoman.svg', import.meta.url).href;
const WOLF_HEAD_SVG_URL = new URL('../../assets/characters/dark_animals/wolf-head.svg', import.meta.url).href;
const WOLF_HOWL_SVG_URL = new URL('../../assets/characters/dark_animals/wolf-howl.svg', import.meta.url).href;
const BOAR_SVG_URL = new URL('../../assets/characters/dark_animals/boar.svg', import.meta.url).href;
const LANTERNITE_SVG_URL = new URL('../../assets/characters/lanternite.svg', import.meta.url).href;
const LANTERNITE_NEST_SVG_URL = new URL('../../assets/characters/lanternite_nest.svg', import.meta.url).href;
const SWARMLING_SVG_URL = new URL('../../assets/characters/dark_animals/swarmling.svg', import.meta.url).href;

export class AssetRegistry {
    private slimeTexture: Texture | null = null;
    private swordwomanTexture: Texture | null = null;
    private wolfHeadTexture: Texture | null = null;
    private wolfHowlTexture: Texture | null = null;
    private boarTexture: Texture | null = null;
    private lanterniteTexture: Texture | null = null;
    private lanterniteNestTexture: Texture | null = null;
    private swarmlingTexture: Texture | null = null;
    private campfireTexture: Texture | null = null;
    private effectTextures: Partial<Record<EffectImageKey, Texture>> = {};
    private playerPortraitTextures: Map<string, Texture> = new Map();

    /** Set to true after load() completes so UnitRenderer can sync deferred character sprites. */
    pendingUnitSync: boolean = false;

    getCharacterTexture(characterId: string): Texture | null {
        if (characterId === 'enemy_ranged') return this.slimeTexture;
        if (characterId === 'enemy_melee') return this.swordwomanTexture;
        if (characterId === 'dark_wolf') return this.wolfHeadTexture;
        if (characterId === 'alpha_wolf') return this.wolfHowlTexture;
        if (characterId === 'boar') return this.boarTexture;
        if (characterId === 'lanternite') return this.lanterniteTexture;
        if (characterId === 'lanternite_nest') return this.lanterniteNestTexture;
        if (characterId === 'swarmling') return this.swarmlingTexture;
        return null;
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

        await loadOne('slime SVG', SLIME_SVG_URL, (t) => { this.slimeTexture = t; });
        await loadOne('swordwoman SVG', SWORDWOMAN_SVG_URL, (t) => { this.swordwomanTexture = t; });
        await loadOne('wolf-head SVG', WOLF_HEAD_SVG_URL, (t) => { this.wolfHeadTexture = t; });
        await loadOne('wolf-howl SVG', WOLF_HOWL_SVG_URL, (t) => { this.wolfHowlTexture = t; });
        await loadOne('boar SVG', BOAR_SVG_URL, (t) => { this.boarTexture = t; });
        await loadOne('lanternite SVG', LANTERNITE_SVG_URL, (t) => { this.lanterniteTexture = t; });
        await loadOne('lanternite_nest SVG', LANTERNITE_NEST_SVG_URL, (t) => { this.lanterniteNestTexture = t; });
        await loadOne('swarmling SVG', SWARMLING_SVG_URL, (t) => { this.swarmlingTexture = t; });

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
        this.slimeTexture = null;
        this.swordwomanTexture = null;
        this.wolfHeadTexture = null;
        this.wolfHowlTexture = null;
        this.boarTexture = null;
        this.lanterniteTexture = null;
        this.lanterniteNestTexture = null;
        this.campfireTexture = null;
        this.effectTextures = {};
        this.playerPortraitTextures.clear();
    }
}
