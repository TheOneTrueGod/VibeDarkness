/**
 * TerrainManager - High-level interface for terrain queries and pathfinding.
 *
 * Wraps a TerrainGrid and a Pathfinder, providing convenient methods
 * for the engine and units to query terrain properties and find paths.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TerrainType } from './TerrainType';
import { Pathfinder } from './Pathfinding';
import { EARTH_CORE_STONE_DAMAGE_PER_INSTANCE } from '../card_defs/earth_core/earthCoreConstants';
import type {
    SerializedStoneTileMutation,
    StoneTileState,
    StoneTileStateData,
    TerrainStoneDamagedTransition,
} from './TerrainGrid';

export interface TerrainStoneDamagedEvent extends TerrainStoneDamagedTransition {
    worldX: number;
    worldY: number;
}

export class TerrainManager {
    readonly grid: TerrainGrid;
    readonly pathfinder: Pathfinder;
    private onStoneDamaged?: (event: TerrainStoneDamagedEvent) => void;

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

    /**
     * Find a grid-cell path between two grid positions.
     * Returns an array of grid cells to traverse (excluding start),
     * each exactly 1 cell apart, or null if unreachable.
     */
    findGridPath(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
    ): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPath(fromCol, fromRow, toCol, toRow);
    }

    /**
     * Find a grid path with blocked cells (e.g. crystal-protected tiles for enemy pathfinding).
     * Blocked cells are treated as impassable. Not cached.
     */
    findGridPathWithBlocked(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
        blockedCells: Set<string>,
    ): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPathWithBlocked(fromCol, fromRow, toCol, toRow, blockedCells);
    }

    /** Clear the pathfinding cache. */
    clearPathCache(): void {
        this.pathfinder.clearCache();
    }

    getStoneState(col: number, row: number): StoneTileState {
        return this.grid.getStoneState(col, row);
    }

    getStoneHealth(col: number, row: number): number {
        return this.grid.getStoneHealth(col, row);
    }

    createOrMarkRock(col: number, row: number): StoneTileStateData | null {
        this.clearPathCache();
        return this.grid.createOrMarkRock(col, row);
    }

    damageRock(
        col: number,
        row: number,
        damage: number = EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    ): TerrainStoneDamagedTransition | null {
        this.clearPathCache();
        const transition = this.grid.damageRock(col, row, damage);
        this.emitStoneDamagedIfNeeded(transition);
        return transition;
    }

    consumeRockInRadius(centerCol: number, centerRow: number, radius: number): TerrainStoneDamagedTransition | null {
        this.clearPathCache();
        const transition = this.grid.consumeRockInRadius(centerCol, centerRow, radius);
        this.emitStoneDamagedIfNeeded(transition);
        return transition;
    }

    setStoneDamagedEmitter(emitter: ((event: TerrainStoneDamagedEvent) => void) | undefined): void {
        this.onStoneDamaged = emitter;
    }

    toStoneMutationsJSON(): SerializedStoneTileMutation[] {
        return this.grid.toStoneMutationsJSON();
    }

    restoreStoneMutationsJSON(data: SerializedStoneTileMutation[] | undefined): void {
        this.grid.restoreStoneMutationsJSON(data);
        this.clearPathCache();
    }

    private emitStoneDamagedIfNeeded(transition: TerrainStoneDamagedTransition | null): void {
        if (!transition || !this.onStoneDamaged) return;
        const world = this.grid.gridToWorld(transition.col, transition.row);
        this.onStoneDamaged({
            ...transition,
            worldX: world.x,
            worldY: world.y,
        });
    }
}
