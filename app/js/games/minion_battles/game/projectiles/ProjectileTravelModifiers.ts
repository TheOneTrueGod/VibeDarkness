import { TerrainType } from '../../terrain/TerrainType';

export type ProjectileModifierId = 'stonephase';

export interface ProjectileTraversalSegment {
    terrainType: TerrainType;
    segmentDistance: number;
}

export interface ProjectileTravelModifier {
    id: ProjectileModifierId;
    shouldCountDistance?(segment: ProjectileTraversalSegment): boolean;
}

const STONEPHASE_MODIFIER: ProjectileTravelModifier = {
    id: 'stonephase',
    shouldCountDistance: (segment) => segment.terrainType !== TerrainType.Rock,
};

const PROJECTILE_TRAVEL_MODIFIER_MAP: Record<ProjectileModifierId, ProjectileTravelModifier> = {
    stonephase: STONEPHASE_MODIFIER,
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
