/**
 * Gameplay definitions for terrain effect types (ground / air layer effects).
 *
 * Render-only visuals live in `game/GameRenderer/terrainEffectDefs.ts`; this registry holds
 * gameplay flags that belong to the effect *type* rather than to each serialized record
 * (see the `game-object-def-pattern` skill).
 */

import type { CreatureType } from '../units/unit_defs/unitDef';

// Kept dependency-free at runtime on purpose (type-only imports above): `terrain/TerrainManager.ts`
// reaches this file through `terrainClearing.ts`, so it must not pull in unit defs / pixi.
// `tileTransitions.ts` re-exports these.
export const BRAMBLE_SLOW_EFFECT_TYPE = 'bramble_slow';
export const DARK_THORN_EFFECT_TYPE = 'dark_thorn';

/** Which creature types a hazard hurts: only the listed types, or everyone except them. */
export type CreatureFilter = { only: readonly CreatureType[] } | { except: readonly CreatureType[] };

/**
 * Thorn behaviour for a ground effect type: a grounded unit that ENTERS the cell (or LANDS on it
 * from the air) takes damage; standing on it does nothing. See `terrainEffects/thorns.ts`.
 */
export interface ThornsDef {
    /** Units the thorns can hurt; everyone else walks over them untouched (and doesn't consume them). */
    hurts: CreatureFilter;
    enterDamage: number;
    landDamage: number;
    /** When true, the effect is removed after it damages a unit. */
    consumeOnTrigger: boolean;
}

/** Damage when a grounded unit steps onto thorns. */
export const THORN_ENTER_DAMAGE = 2;
/** Damage when a unit lands (from knockback / lift) on thorns. */
export const THORN_LAND_DAMAGE = 4;
/** Thornbinder `dark_thorn` enter damage (same as shared thorn enter). */
export const DARK_THORN_ENTER_DAMAGE = THORN_ENTER_DAMAGE;
/** Thornbinder `dark_thorn` land damage (2x shared thorn land). */
export const DARK_THORN_LAND_DAMAGE = THORN_LAND_DAMAGE * 2;

export interface TerrainEffectDef {
    effectType: string;
    layer: 'ground' | 'air';
    /** When true, terrain clearing (scour / gust / blast) never removes this effect. */
    clearResistant?: boolean;
    /** Present on thorn-style hazards (enter / land damage, optionally consumed). */
    thorns?: ThornsDef;
}

export const TERRAIN_EFFECT_DEFS: Readonly<Record<string, TerrainEffectDef>> = {
    [BRAMBLE_SLOW_EFFECT_TYPE]: {
        effectType: BRAMBLE_SLOW_EFFECT_TYPE,
        layer: 'ground',
        thorns: {
            hurts: { only: ['dark_creature'] },
            enterDamage: THORN_ENTER_DAMAGE,
            landDamage: THORN_LAND_DAMAGE,
            consumeOnTrigger: true,
        },
    },
    [DARK_THORN_EFFECT_TYPE]: {
        effectType: DARK_THORN_EFFECT_TYPE,
        layer: 'ground',
        thorns: {
            hurts: { except: ['dark_creature'] },
            enterDamage: DARK_THORN_ENTER_DAMAGE,
            landDamage: DARK_THORN_LAND_DAMAGE,
            consumeOnTrigger: true,
        },
    },
};

/** Look up the gameplay def for an effect type. Unknown types have no def and are clearable. */
export function getTerrainEffectDef(effectType: string): TerrainEffectDef | undefined {
    return Object.prototype.hasOwnProperty.call(TERRAIN_EFFECT_DEFS, effectType)
        ? TERRAIN_EFFECT_DEFS[effectType]
        : undefined;
}
