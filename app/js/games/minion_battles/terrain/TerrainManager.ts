/**
 * TerrainManager - High-level interface for terrain queries and pathfinding.
 *
 * Wraps a TerrainGrid and a Pathfinder, providing convenient methods
 * for the engine and units to query terrain properties and find paths.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { Pathfinder } from './Pathfinding';

export class TerrainManager {
    readonly grid: TerrainGrid;
    readonly pathfinder: Pathfinder;

    constructor(grid: TerrainGrid) {
        this.grid = grid;
        this.pathfinder = new Pathfinder(grid);
    }

    /** Get the terrain type at a world position. */
    getTerrainAt(worldX: number, worldY: number): TerrainType {
        return this.grid.getAtWorld(worldX, worldY);
    }

    /** Check if a world position is passable for unit movement. */
    isPassable(worldX: number, worldY: number): boolean {
        return this.grid.isPassable(worldX, worldY);
    }

    /** Get the speed multiplier at a world position. */
    getSpeedMultiplier(worldX: number, worldY: number): number {
        return this.grid.getSpeedMultiplier(worldX, worldY);
    }

    /** Check if a projectile can pass through a world position. */
    isProjectilePassable(worldX: number, worldY: number): boolean {
        return this.grid.isProjectilePassable(worldX, worldY);
    }

    /**
     * Find a path between two world positions.
     * Returns an array of world-space waypoints, or null if unreachable.
     */
    findPath(
        fromX: number,
        fromY: number,
        toX: number,
        toY: number,
    ): { x: number; y: number }[] | null {
        return this.pathfinder.findPath(fromX, fromY, toX, toY);
    }

    /** Clear the pathfinding cache. */
    clearPathCache(): void {
        this.pathfinder.clearCache();
    }
}
