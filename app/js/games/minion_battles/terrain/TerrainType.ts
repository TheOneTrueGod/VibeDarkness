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
}

export interface TerrainProperties {
    /** Display name. */
    name: string;
    /** Hex color string for rendering. */
    color: string;
    /** Whether units can walk on this terrain. */
    passable: boolean;
    /** Speed multiplier (1.0 = normal, 0.75 = 25% slower, 0 = impassable). */
    speedMultiplier: number;
    /** A* pathfinding cost weight (1.0 = normal, higher = less preferred). */
    pathfindingWeight: number;
    /** Whether ranged attacks (projectiles) can pass over this terrain. */
    projectilePassable: boolean;
}

export const TERRAIN_PROPERTIES: Record<TerrainType, TerrainProperties> = {
    [TerrainType.Dirt]: {
        name: 'Dirt',
        color: '#8B6914',
        passable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
    },
    [TerrainType.Grass]: {
        name: 'Grass',
        color: '#4CAF50',
        passable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
    },
    [TerrainType.ThickGrass]: {
        name: 'Thick Grass',
        color: '#2E7D32',
        passable: true,
        speedMultiplier: 0.75,
        pathfindingWeight: 1.5,
        projectilePassable: true,
    },
    [TerrainType.Rock]: {
        name: 'Rock',
        color: '#757575',
        passable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
    },
};
