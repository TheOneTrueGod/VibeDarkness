/**
 * TerrainType - Enum and properties for each terrain type.
 *
 * Each terrain type has a display name, color for rendering,
 * passability flag, speed multiplier, and pathfinding weight.
 */

export enum TerrainType {
    Dirt = 0,
    Grass = 1,
    ThickGrass = 2,
    Rock = 3,
    /** Runtime-only: destroyed rock rubble (passable). Not in terrain editor bedrock palette. */
    Rubble = 4,
    /**
     * Synthetic filler for gaps in a stitched mission map (e.g. the unused corner of an L-shaped
     * layout) — see `stitchTerrain`. Renders as void (fully transparent, no fog/darkness overlay)
     * and is impassable to units, identical to the area outside the map bounds. Not in terrain
     * editor bedrock palette; never authored directly into a segment.
     */
    Impassable = 5,
    /**
     * Water level 2. Blocks walking and pathfinding but not projectiles. Forced movement (knockback,
     * lift) can carry a unit onto it, which triggers its `forcedEntryHazard` (drowning).
     */
    Water = 6,
    /** Water level 1. Walkable at half speed; projectiles pass over it. */
    ShallowWater = 7,
    /** Water level 3. Like Water, but drowning in it hurts twice as much. */
    DeepWater = 8,
}

/** Terrain hazard a unit suffers when forced onto a tile it cannot walk on. Rules: `game/terrainHazards/`. */
export type TerrainHazardId = 'drown' | 'drown_deep';

export type TerrainRenderStrategy = 'marching-squares' | 'hard-edge';

export interface TerrainProperties {
    /** Display name. */
    name: string;
    /** Hex color string for rendering. */
    color: string;
    /** Whether units can walk on this terrain. */
    passable: boolean;
    /**
     * Whether forced movement (knockback, lift) can carry a unit onto this terrain. True for every
     * walkable type; Water and Deep Water are the non-walkable types that allow it.
     */
    forcedMovementPassable: boolean;
    /** Hazard triggered when a grounded unit ends up on this terrain (forced there). */
    forcedEntryHazard?: TerrainHazardId;
    /**
     * Depth for water types (1 shallow, 2 water, 3 deep). Rock and gravel placed on water raise the
     * ground instead of sitting on top; see `raiseGround`.
     */
    waterLevel?: number;
    /** Speed multiplier (1.0 = normal, 0.75 = 25% slower, 0 = impassable). */
    speedMultiplier: number;
    /** A* pathfinding cost weight (1.0 = normal, higher = less preferred). */
    pathfindingWeight: number;
    /** Whether ranged attacks (projectiles) can pass over this terrain. */
    projectilePassable: boolean;
    /**
     * Whether a projectile is stopped by this terrain unless a travel modifier traverses it
     * (e.g. stonephase). Rock and Impassable block, mirroring `TerrainGrid.hasLineOfSight`.
     * Read through `TerrainManager.isProjectileObstructedAt`, which uses effective terrain.
     */
    blocksProjectiles: boolean;
    /** Which layer renderer to use for this terrain type. */
    renderStrategy: TerrainRenderStrategy;
    /** If true, soft-terrain (marching-squares) layers must not bleed into cells of this type. */
    blocksBleed: boolean;
    /** Other hard-edge terrain types treated as same material (no bleed/chamfer/border at shared edges). */
    hardEdgeFamily: TerrainType[];
}

export const TERRAIN_PROPERTIES: Record<TerrainType, TerrainProperties> = {
    [TerrainType.Dirt]: {
        name: 'Dirt',
        color: '#8B6914',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Grass]: {
        name: 'Grass',
        color: '#4CAF50',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.ThickGrass]: {
        name: 'Thick Grass',
        color: '#2E7D32',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 0.75,
        pathfindingWeight: 1.5,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Rock]: {
        name: 'Rock',
        color: '#757575',
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [],
    },
    [TerrainType.Rubble]: {
        name: 'Rubble',
        color: '#6b5b4f',
        passable: true,
        forcedMovementPassable: true,
        speedMultiplier: 0.85,
        pathfindingWeight: 1.2,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [TerrainType.Rock],
    },
    [TerrainType.Impassable]: {
        name: 'Impassable',
        // Never actually painted — TerrainRenderer skips this type entirely (renders as void).
        color: '#1a1a2e',
        // Matches TerrainGrid.get()'s out-of-bounds fallback (Rock) exactly, so this behaves
        // identically to standing just past the edge of the map.
        passable: false,
        forcedMovementPassable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: true,
        // Unused: excluded from TerrainRenderer's LAYER_ORDER, so no layer renderer ever runs for it.
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [],
    },
    [TerrainType.Water]: {
        name: 'Water',
        color: '#2F7FD6',
        passable: false,
        forcedMovementPassable: true,
        forcedEntryHazard: 'drown',
        waterLevel: 2,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.ShallowWater]: {
        name: 'Shallow Water',
        color: '#7DBDF0',
        passable: true,
        forcedMovementPassable: true,
        waterLevel: 1,
        speedMultiplier: 0.5,
        pathfindingWeight: 2.0,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.DeepWater]: {
        name: 'Deep Water',
        color: '#1B4A94',
        passable: false,
        forcedMovementPassable: true,
        forcedEntryHazard: 'drown_deep',
        waterLevel: 3,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        blocksProjectiles: false,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
};

/** How much each kind of placed stone raises the ground on water (lowers its water level). */
export const GROUND_RAISE = {
    rock: 2,
    gravel: 1,
} as const;

/** Terrain for each water level; level 0 (water filled in) is gravel. */
const TERRAIN_FOR_WATER_LEVEL: readonly TerrainType[] = [
    TerrainType.Rubble,
    TerrainType.ShallowWater,
    TerrainType.Water,
    TerrainType.DeepWater,
];

/** Water types (any `waterLevel`), e.g. what a sliding rock sinks into. */
export const WATER_TERRAIN_TYPES: readonly TerrainType[] = (
    Object.keys(TERRAIN_PROPERTIES).map(Number) as TerrainType[]
).filter((type) => (TERRAIN_PROPERTIES[type].waterLevel ?? 0) > 0);

/**
 * What a water tile becomes when stone raises its ground by `amount` levels (rock 2, gravel 1):
 * deep + rock = shallow, water + gravel = shallow, shallow + gravel = gravel. Null for non-water.
 */
export function raiseGround(type: TerrainType, amount: number): TerrainType | null {
    const level = TERRAIN_PROPERTIES[type].waterLevel;
    if (!level) return null;
    return TERRAIN_FOR_WATER_LEVEL[Math.max(0, level - amount)];
}
