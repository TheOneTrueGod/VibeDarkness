/**
 * Gameplay definitions for terrain effect types (ground / air layer effects).
 *
 * Render-only visuals live in `game/GameRenderer/terrainEffectDefs.ts`; this registry holds
 * gameplay flags that belong to the effect *type* rather than to each serialized record
 * (see the `game-object-def-pattern` skill).
 */

// Kept dependency-free on purpose: `terrain/TerrainManager.ts` reaches this file through
// `terrainClearing.ts`, so it must not pull in unit defs / pixi. `tileTransitions.ts` re-exports these.
export const BRAMBLE_SLOW_EFFECT_TYPE = 'bramble_slow';
export const DARK_THORN_EFFECT_TYPE = 'dark_thorn';

export interface TerrainEffectDef {
    effectType: string;
    layer: 'ground' | 'air';
    /** When true, terrain clearing (scour / gust / blast) never removes this effect. */
    clearResistant?: boolean;
}

export const TERRAIN_EFFECT_DEFS: Readonly<Record<string, TerrainEffectDef>> = {
    [BRAMBLE_SLOW_EFFECT_TYPE]: { effectType: BRAMBLE_SLOW_EFFECT_TYPE, layer: 'ground' },
    [DARK_THORN_EFFECT_TYPE]: { effectType: DARK_THORN_EFFECT_TYPE, layer: 'ground' },
};

/** Look up the gameplay def for an effect type. Unknown types have no def and are clearable. */
export function getTerrainEffectDef(effectType: string): TerrainEffectDef | undefined {
    return Object.prototype.hasOwnProperty.call(TERRAIN_EFFECT_DEFS, effectType)
        ? TERRAIN_EFFECT_DEFS[effectType]
        : undefined;
}
