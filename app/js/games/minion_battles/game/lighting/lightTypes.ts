/**
 * Typed light channels for the multi-channel lighting grid.
 *
 * Negative emission (Gather Light / Dark Swarm) is void darkness — not DarkLight.
 */

export const LIGHT_TYPES = ['FireLight', 'DayLight', 'DarkLight', 'LanternLight'] as const;

export type LightType = (typeof LIGHT_TYPES)[number];

/** Default type for unspecified emitters (backward compatible). */
export const DEFAULT_LIGHT_TYPE: LightType = 'FireLight';

/**
 * Render sort: DayLight > LanternLight ≈ DarkLight > FireLight.
 * Equal-priority Lantern vs Dark: higher intensity wins; exact tie → LanternLight.
 */
export const LIGHT_TYPE_RENDER_RANK: Record<LightType, number> = {
    DayLight: 3,
    LanternLight: 2,
    DarkLight: 2,
    FireLight: 1,
};

/** Marker tint when a light source has no explicit `color`. */
export const LIGHT_TYPE_TINT: Record<LightType, number> = {
    FireLight: 0xffaa40,
    DayLight: 0x88ccff,
    DarkLight: 0x9933cc,
    LanternLight: 0x44cc66,
};

/** Soft overlay wash RGBA for the dominant render type (alpha baked into string usage). */
export const LIGHT_TYPE_OVERLAY_RGB: Record<LightType, { r: number; g: number; b: number }> = {
    FireLight: { r: 255, g: 170, b: 64 },
    DayLight: { r: 239, g: 239, b: 110 },
    DarkLight: { r: 153, g: 51, b: 204 },
    LanternLight: { r: 68, g: 204, b: 102 },
};

export type LightTypeIntensities = Record<LightType, number>;

export function emptyLightTypeIntensities(): LightTypeIntensities {
    return { FireLight: 0, DayLight: 0, DarkLight: 0, LanternLight: 0 };
}

export function isLightType(value: unknown): value is LightType {
    return typeof value === 'string' && (LIGHT_TYPES as readonly string[]).includes(value);
}

export function resolveLightType(value: unknown): LightType {
    return isLightType(value) ? value : DEFAULT_LIGHT_TYPE;
}

/**
 * Pick which light type "wins" for rendering on a tile.
 * Ignores non-positive intensities. Returns null if nothing is lit.
 */
export function pickRenderLightType(intensities: LightTypeIntensities): LightType | null {
    let best: LightType | null = null;
    let bestRank = -1;
    let bestIntensity = -Infinity;

    for (const type of LIGHT_TYPES) {
        const intensity = intensities[type];
        if (intensity <= 0) continue;
        const rank = LIGHT_TYPE_RENDER_RANK[type];
        if (
            best === null
            || rank > bestRank
            || (rank === bestRank && intensity > bestIntensity)
            || (rank === bestRank && intensity === bestIntensity && type === 'LanternLight')
        ) {
            best = type;
            bestRank = rank;
            bestIntensity = intensity;
        }
    }
    return best;
}

/** Visibility from positive channels + void darkness (typically ≤ 0). */
export function visibilityFromChannels(
    intensities: LightTypeIntensities,
    voidDarkness: number,
    globalLightLevel = 0,
): number {
    let maxPositive = 0;
    for (const type of LIGHT_TYPES) {
        if (intensities[type] > maxPositive) maxPositive = intensities[type];
    }
    return globalLightLevel + maxPositive + voidDarkness;
}
