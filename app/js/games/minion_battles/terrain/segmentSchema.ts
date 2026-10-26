import { z } from 'zod';
import { TerrainType } from './TerrainType';
import { MapSegmentNetworkSchema } from './networkSchema';

/** Terrain types a segment may contain. Rubble and Impassable are runtime-only. */
export const AUTHORED_TERRAIN_TYPES: readonly number[] = [
    TerrainType.Dirt,
    TerrainType.Grass,
    TerrainType.ThickGrass,
    TerrainType.Rock,
    TerrainType.Water,
];

export const POI_TYPES =['generic', 'campfire', 'crystal', 'nest', 'patrol_point', 'enemySpawn', 'playerSpawn'] as const;
export type POIType = typeof POI_TYPES[number];

export const MapSegmentPOISchema = z.object({
    id: z.string(),
    label: z.string(),
    col: z.number().int().nonnegative(),
    row: z.number().int().nonnegative(),
    type: z.enum(POI_TYPES).default('generic'),
    radius: z.number().nonnegative().optional(),
    /** Optional tags for filtering POIs by game logic (e.g. spawnBehaviour: 'closestEnemySpawnPoint'). */
    tags: z.array(z.string()).optional(),
});
export type MapSegmentPOI = z.infer<typeof MapSegmentPOISchema>;

export const ZONE_SHAPES = ['box', 'circle'] as const;
export type ZoneShape = typeof ZONE_SHAPES[number];

/**
 * A named area within a segment (segment-local grid coords), resolvable to a list of
 * grid squares. 'circle' is an ellipse inscribed in the topLeft/bottomRight bounding box.
 * See `terrain/zones.ts` for the resolver. Reusable across missions/systems (spawning,
 * and eventually enter-zone objective triggers) by referencing `id`.
 */
export const MapSegmentZoneSchema = z.object({
    id: z.string(),
    shape: z.enum(ZONE_SHAPES),
    topLeft: z.object({ col: z.number().int(), row: z.number().int() }),
    bottomRight: z.object({ col: z.number().int(), row: z.number().int() }),
});
export type MapSegmentZone = z.infer<typeof MapSegmentZoneSchema>;

export const MapSegmentDataSchema = z.object({
    id: z.string(),
    gridCol: z.number().int(),
    gridRow: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    terrain: z.array(z.array(z.number().int().refine((t) => AUTHORED_TERRAIN_TYPES.includes(t), {
        message: 'Not an authored terrain type (see AUTHORED_TERRAIN_TYPES)',
    }))),
    pointsOfInterest: z.array(MapSegmentPOISchema).default([]),
    zones: z.array(MapSegmentZoneSchema).default([]),
    /**
     * Connectivity graph nodes/edges for this segment (e.g. lanternite nest sites). Kept as a
     * sibling to `pointsOfInterest` rather than folded into `MapSegmentPOI` — POIs are consumed by
     * unrelated systems (`closestEnemySpawnPoint` spawn behaviour, `BattleSession`'s blanket POI
     * auto-collection) that would otherwise need to filter out network-only entries.
     */
    network: MapSegmentNetworkSchema.optional(),
});
export type MapSegmentData = z.infer<typeof MapSegmentDataSchema>;

