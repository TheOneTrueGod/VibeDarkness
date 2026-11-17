/**
 * Durable terrain: terrain types that carry health or wear on their floor tile and turn into another
 * type when it runs out (Briar -> Tangle -> Grass). Driven by two `TerrainProperties` fields,
 * `durability` and `projectileWear`; `TerrainManager` owns the mutation APIs. State lives in the
 * floor tile's `DestructibleState`, so it serializes with `floorTiles`.
 */

import type { DestructibleState, FloorTile } from './FloorTile';
import { TERRAIN_PROPERTIES, TerrainType, WEAR_DESTRUCTIBLE_KIND } from './TerrainType';

/** Result of damaging or wearing a durable tile. `typeChanged` is true when it turned into another type. */
export interface DurableTerrainTransition {
    col: number;
    row: number;
    previousHealth: number;
    health: number;
    maxHealth: number;
    previousTerrainType: TerrainType;
    terrainType: TerrainType;
    typeChanged: boolean;
    sourceUnitId?: string | null;
}

/** True for terrain with `durability` (health damaged by `damageDurableTerrain`). */
export function isDurableTerrain(type: TerrainType): boolean {
    return TERRAIN_PROPERTIES[type]?.durability !== undefined;
}

/** True for terrain with `projectileWear` (worn by `wearTerrainByProjectile`). */
export function isProjectileWornTerrain(type: TerrainType): boolean {
    return TERRAIN_PROPERTIES[type]?.projectileWear !== undefined;
}

/** The destructible state a fresh tile of `type` starts with, or undefined when it has neither health nor wear. */
export function freshDurableState(type: TerrainType): DestructibleState | undefined {
    const props = TERRAIN_PROPERTIES[type];
    if (props.durability) {
        const { maxHealth, kind } = props.durability;
        return { health: maxHealth, maxHealth, kind };
    }
    if (props.projectileWear) {
        const { hits } = props.projectileWear;
        return { health: hits, maxHealth: hits, kind: WEAR_DESTRUCTIBLE_KIND };
    }
    return undefined;
}

/** A floor tile of `type` at full health / unworn. */
export function durableFloorTile(type: TerrainType): FloorTile {
    const destructible = freshDurableState(type);
    return destructible ? { terrainType: type, destructible } : { terrainType: type };
}

/**
 * Whether durable terrain `placing` may be laid on a tile currently `current`: open walkable ground
 * (Tangle included, so Briar regrows over it), not water, and not already `placing`. Rock,
 * Impassable, water and existing Briar are left alone.
 */
export function canTakeDurableTerrain(current: TerrainType, placing: TerrainType): boolean {
    if (current === placing) return false;
    const props = TERRAIN_PROPERTIES[current];
    if (!props.passable) return false;
    return (props.waterLevel ?? 0) === 0;
}
