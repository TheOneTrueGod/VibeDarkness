import { TerrainType } from '../../terrain/TerrainType';

/**
 * - `stonephase`: flies through rock (no distance counted inside it).
 * - `stopsAtWalls`: the projectile stops at the first terrain that blocks projectiles
 *   (`TerrainProperties.blocksProjectiles`) unless one of the other modifiers traverses it.
 */
export type ProjectileModifierId = 'stonephase' | 'stopsAtWalls';

export interface ProjectileTraversalSegment {
    terrainType: TerrainType;
    segmentDistance: number;
}

export interface ProjectileTravelModifier {
    id: ProjectileModifierId;
    shouldCountDistance?(segment: ProjectileTraversalSegment): boolean;
    /** True if this modifier lets the projectile pass over obstructing terrain of this type. */
    canTraverse?(terrainType: TerrainType): boolean;
}

const STONEPHASE_MODIFIER: ProjectileTravelModifier = {
    id: 'stonephase',
    shouldCountDistance: (segment) => segment.terrainType !== TerrainType.Rock,
    canTraverse: (terrainType) => terrainType === TerrainType.Rock,
};

const STOPS_AT_WALLS_MODIFIER: ProjectileTravelModifier = {
    id: 'stopsAtWalls',
};

const PROJECTILE_TRAVEL_MODIFIER_MAP: Record<ProjectileModifierId, ProjectileTravelModifier> = {
    stonephase: STONEPHASE_MODIFIER,
    stopsAtWalls: STOPS_AT_WALLS_MODIFIER,
};

export function shouldCountTraversalDistance(
    segment: ProjectileTraversalSegment,
    modifierIds: readonly ProjectileModifierId[],
): boolean {
    for (const modifierId of modifierIds) {
        const modifier = PROJECTILE_TRAVEL_MODIFIER_MAP[modifierId];
        if (!modifier) continue;
        if (modifier.shouldCountDistance && !modifier.shouldCountDistance(segment)) {
            return false;
        }
    }
    return true;
}

/** True if any active modifier lets a projectile pass over obstructing terrain of this type. */
export function isTraversableByModifiers(
    terrainType: TerrainType,
    modifierIds: readonly ProjectileModifierId[],
): boolean {
    for (const modifierId of modifierIds) {
        const modifier = PROJECTILE_TRAVEL_MODIFIER_MAP[modifierId];
        if (modifier?.canTraverse?.(terrainType)) return true;
    }
    return false;
}
