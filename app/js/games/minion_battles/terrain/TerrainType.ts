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
}

export type TerrainRenderStrategy = 'marching-squares' | 'hard-edge';

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
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Grass]: {
        name: 'Grass',
        color: '#4CAF50',
        passable: true,
        speedMultiplier: 1.0,
        pathfindingWeight: 1.0,
        projectilePassable: true,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.ThickGrass]: {
        name: 'Thick Grass',
        color: '#2E7D32',
        passable: true,
        speedMultiplier: 0.75,
        pathfindingWeight: 1.5,
        projectilePassable: true,
        renderStrategy: 'marching-squares',
        blocksBleed: false,
        hardEdgeFamily: [],
    },
    [TerrainType.Rock]: {
        name: 'Rock',
        color: '#757575',
        passable: false,
        speedMultiplier: 0,
        pathfindingWeight: Infinity,
        projectilePassable: true,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [],
    },
    [TerrainType.Rubble]: {
        name: 'Rubble',
        color: '#6b5b4f',
        passable: true,
        speedMultiplier: 0.85,
        pathfindingWeight: 1.2,
        projectilePassable: true,
        renderStrategy: 'hard-edge',
        blocksBleed: true,
        hardEdgeFamily: [TerrainType.Rock],
    },
};
