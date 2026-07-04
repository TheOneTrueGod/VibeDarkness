export const EFFECT_IMAGE_SOURCES = {
    darkBlob: new URL('../assets/effects/darkBlob.svg', import.meta.url).href,
    rockChip: new URL('../assets/effects/rockChip.svg', import.meta.url).href,
    /** Neutral white glow — unlike `darkBlob`, this tints faithfully to any hex color. */
    glowOrb: new URL('../assets/effects/glowOrb.svg', import.meta.url).href,
} as const;

export type EffectImageKey = keyof typeof EFFECT_IMAGE_SOURCES;

export function getEffectImageSource(key: EffectImageKey): string {
    return EFFECT_IMAGE_SOURCES[key];
}

