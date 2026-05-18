import type { LoadedBattleModel, LoadedPortrait, PortraitManifest } from './portraitTypes';

const rawManifests = import.meta.glob('./portraits/*/manifest.json', {
    eager: true,
    import: 'default',
}) as Record<string, PortraitManifest>;

const allSvgUrls = import.meta.glob('./portraits/**/*.svg', {
    query: '?url',
    eager: true,
    import: 'default',
}) as Record<string, string>;

const allPngUrls = import.meta.glob('./portraits/**/*.png', {
    query: '?url',
    eager: true,
    import: 'default',
}) as Record<string, string>;

function hexToPixi(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
}

function resolveAssetUrl(folder: string, filename: string): string | undefined {
    return allSvgUrls[`${folder}/${filename}`] ?? allPngUrls[`${folder}/${filename}`];
}

function buildPortraitRegistry(): Record<string, LoadedPortrait> {
    const registry: Record<string, LoadedPortrait> = {};

    for (const [path, manifest] of Object.entries(rawManifests)) {
        // './portraits/warrior/manifest.json' → 'warrior'
        const id = path.split('/')[2];
        const folder = `./portraits/${id}`;

        const portraitFile = manifest.portraitRef ?? 'portrait.svg';
        const picture = resolveAssetUrl(folder, portraitFile);

        let spriteUrl: string | undefined;
        let modelImageUrl: string | undefined;
        if (manifest.battleModel.type === 'sprite') {
            spriteUrl = resolveAssetUrl(folder, manifest.battleModel.spriteRef);
            modelImageUrl = spriteUrl;
        } else if (manifest.battleModel.modelImage) {
            modelImageUrl = resolveAssetUrl(folder, manifest.battleModel.modelImage);
        }

        const battleModel: LoadedBattleModel = {
            type: manifest.battleModel.type,
            spriteUrl,
            modelImageUrl,
            bodyColor: hexToPixi(manifest.battleModel.bodyColor),
            size: manifest.battleModel.size,
            showNameLetter: manifest.battleModel.showNameLetter,
            innerCircle: manifest.battleModel.innerCircle
                ? {
                      color: hexToPixi(manifest.battleModel.innerCircle.color),
                      radiusRatio: manifest.battleModel.innerCircle.radiusRatio,
                  }
                : null,
        };

        registry[id] = {
            id,
            name: manifest.name,
            picture,
            battleModel,
            allowedPlayerIds: manifest.allowedPlayerIds,
        };
    }

    return registry;
}

export const PORTRAITS: Record<string, LoadedPortrait> = buildPortraitRegistry();

const PORTRAIT_IDS = Object.keys(PORTRAITS);

export function getPortrait(id: string): LoadedPortrait | undefined {
    return PORTRAITS[id];
}

export function getPortraitIds(): string[] {
    return [...PORTRAIT_IDS];
}

export function getPortraitCount(): number {
    return PORTRAIT_IDS.length;
}

/** True when the player may select the given portrait (no restriction, or their ID is in the list). */
export function isPortraitAllowedForPlayer(portraitId: string, playerId: number | undefined): boolean {
    const portrait = PORTRAITS[portraitId];
    if (!portrait?.allowedPlayerIds) return true;
    if (playerId === undefined) return false;
    return portrait.allowedPlayerIds.includes(playerId);
}

/** Portrait IDs the player is allowed to select. If playerId is undefined, returns all IDs. */
export function getPortraitIdsForPlayer(playerId: number | undefined): string[] {
    if (playerId === undefined) return [...PORTRAIT_IDS];
    return PORTRAIT_IDS.filter((id) => isPortraitAllowedForPlayer(id, playerId));
}
