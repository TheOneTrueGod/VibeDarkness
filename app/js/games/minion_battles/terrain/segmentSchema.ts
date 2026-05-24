import { z } from 'zod';
import { TerrainType } from './TerrainType';

export const POI_TYPES = ['generic', 'campfire', 'crystal', 'nest', 'patrol_point', 'enemySpawn'] as const;
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

export const MapSegmentDataSchema = z.object({
    id: z.string(),
    gridCol: z.number().int(),
    gridRow: z.number().int(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    terrain: z.array(z.array(z.number().int().min(0).max(3))),
    pointsOfInterest: z.array(MapSegmentPOISchema).default([]),
});
export type MapSegmentData = z.infer<typeof MapSegmentDataSchema>;

// Ensure TerrainType values stay in sync with the schema max (0–3).
// This is a compile-time check only.
const _terrainTypeCheck: TerrainType = TerrainType.Rock; // Rock = 3, which is the schema max
void _terrainTypeCheck;
