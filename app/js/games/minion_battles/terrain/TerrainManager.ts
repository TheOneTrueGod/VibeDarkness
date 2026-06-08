/**
 * TerrainManager - High-level interface for terrain queries and pathfinding.
 *
 * Wraps a TerrainGrid (bedrock) and a Pathfinder. Sparse floor tiles from
 * TerrainLayerManager override bedrock for effective terrain reads.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { Pathfinder } from './Pathfinding';
import {
    EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/05_earth_core/earthCoreConstants';
import type { FloorTile, TerrainStoneDamagedTransition } from './FloorTile';
import {
    DAMAGE_TIER_NONE,
    getDamageTier,
    getEffectiveTerrain,
    isIntactRock,
} from './FloorTile';
import type { TerrainLayerManager } from '../game/TerrainLayerManager';

export type { TerrainStoneDamagedTransition as TerrainStoneDamagedEvent } from './FloorTile';

export class TerrainManager {
    readonly grid: TerrainGrid;
    readonly pathfinder: Pathfinder;
    private terrainLayers: TerrainLayerManager | null = null;
    private onStoneDamaged?: (event: TerrainStoneDamagedTransition) => void;
    private lastRockDamageSourceUnitId: string | null = null;

    constructor(grid: TerrainGrid) {
        this.grid = grid;
        this.pathfinder = new Pathfinder(grid);
    }

    /** Attach the TerrainLayerManager so floor tiles affect passability and rock queries. */
    setTerrainLayers(layers: TerrainLayerManager): void {
        this.terrainLayers = layers;
        this.pathfinder.setPassabilityFn((col, row) => this.isCellPassableWithFloor(col, row));
    }

    // -------------------------------------------------------------------------
    // Effective terrain (bedrock + floor layer)
    // -------------------------------------------------------------------------

    getFloorTile(col: number, row: number): FloorTile | null {
        return this.terrainLayers?.getFloorTile(col, row) ?? null;
    }

    getEffectiveTerrainType(col: number, row: number): TerrainType {
        const floor = this.getFloorTile(col, row);
        return getEffectiveTerrain(floor, this.grid.get(col, row));
    }

    getEffectiveTerrainAt(worldX: number, worldY: number): TerrainType {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return this.getEffectiveTerrainType(col, row);
    }

    private isCellPassableWithFloor(col: number, row: number): boolean {
        return TERRAIN_PROPERTIES[this.getEffectiveTerrainType(col, row)].passable;
    }

    /** Get the terrain type at a world position (respects floor layer). */
    getTerrainAt(worldX: number, worldY: number): TerrainType {
        return this.getEffectiveTerrainAt(worldX, worldY);
    }

    /** Check if a world position is passable for unit movement (respects floor layer). */
    isPassable(worldX: number, worldY: number): boolean {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return this.isCellPassableWithFloor(col, row);
    }

    /** Get the speed multiplier at a world position (uses effective terrain). */
    getSpeedMultiplier(worldX: number, worldY: number): number {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return TERRAIN_PROPERTIES[this.getEffectiveTerrainType(col, row)].speedMultiplier;
    }

    /** Check if a projectile can pass through a world position (uses effective terrain). */
    isProjectilePassable(worldX: number, worldY: number): boolean {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        return TERRAIN_PROPERTIES[this.getEffectiveTerrainType(col, row)].projectilePassable;
    }

    findPath(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number }[] | null {
        return this.pathfinder.findPath(fromX, fromY, toX, toY);
    }

    findGridPath(fromCol: number, fromRow: number, toCol: number, toRow: number): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPath(fromCol, fromRow, toCol, toRow);
    }

    findGridPathWithBlocked(
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
        blockedCells: Set<string>,
    ): { col: number; row: number }[] | null {
        return this.pathfinder.findGridPathWithBlocked(fromCol, fromRow, toCol, toRow, blockedCells);
    }

    clearPathCache(): void {
        this.pathfinder.clearCache();
    }

    // -------------------------------------------------------------------------
    // Rock / stone system — floor tile layer
    // -------------------------------------------------------------------------

    private implicitRockHealth(col: number, row: number): number {
        const floor = this.getFloorTile(col, row);
        if (floor?.destructible) return floor.destructible.health;
        if (this.grid.get(col, row) === TerrainType.Rock && this.getEffectiveTerrainType(col, row) === TerrainType.Rock) {
            return EARTH_CORE_STONE_HEALTH;
        }
        return 0;
    }

    createOrMarkRock(col: number, row: number, maxHealth: number = EARTH_CORE_STONE_HEALTH): FloorTile | null {
        if (!this.terrainLayers) return null;
        if (col < 0 || col >= this.grid.width || row < 0 || row >= this.grid.height) return null;
        const tile: FloorTile = {
            terrainType: TerrainType.Rock,
            destructible: { health: maxHealth, maxHealth, kind: 'rock' },
        };
        this.terrainLayers.setFloorTile(col, row, tile);
        this.clearPathCache();
        return { ...tile, destructible: { ...tile.destructible! } };
    }

    damageRock(
        col: number,
        row: number,
        damage: number = EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
        sourceUnitId?: string | null,
    ): TerrainStoneDamagedTransition | null {
        if (!this.terrainLayers) return null;

        const bedrock = this.grid.get(col, row);
        const previousFloor = this.getFloorTile(col, row);
        const previousEffective = getEffectiveTerrain(previousFloor, bedrock);
        if (!isIntactRock(previousEffective, previousFloor?.destructible)) return null;

        const previousHealth = this.implicitRockHealth(col, row);
        const maxHealth = previousFloor?.destructible?.maxHealth ?? EARTH_CORE_STONE_HEALTH;
        const previousTier = getDamageTier(previousFloor?.destructible ?? { health: previousHealth, maxHealth, kind: 'rock' });
        const previousTerrainType = previousEffective;

        if (sourceUnitId !== undefined) {
            this.lastRockDamageSourceUnitId = sourceUnitId;
        }

        const floor = this.terrainLayers.ensureFloorFromBedrock(col, row, this.grid, maxHealth);
        if (!floor.destructible) return null;

        const nextHealth = Math.max(0, floor.destructible.health - Math.max(0, damage));
        floor.destructible.health = nextHealth;

        let nextTerrainType = TerrainType.Rock;
        if (nextHealth <= 0) {
            nextTerrainType = TerrainType.Rubble;
            floor.terrainType = TerrainType.Rubble;
            floor.destructible = undefined;
        }

        this.terrainLayers.setFloorTile(col, row, floor);
        this.clearPathCache();

        const nextTier = nextHealth <= 0 ? DAMAGE_TIER_NONE : getDamageTier(floor.destructible);
        const tierChanged = nextTier !== previousTier;
        const destroyed = nextTerrainType === TerrainType.Rubble;

        if (!destroyed && !tierChanged) return null;

        return this.emitStoneDamaged({
            col,
            row,
            previousHealth,
            health: nextHealth,
            maxHealth,
            previousTerrainType,
            terrainType: nextTerrainType,
            tier: nextTier,
            sourceUnitId: sourceUnitId ?? this.lastRockDamageSourceUnitId,
        });
    }

    consumeRockInRadius(
        centerCol: number,
        centerRow: number,
        radius: number,
        sourceUnitId?: string | null,
    ): TerrainStoneDamagedTransition | null {
        if (!this.terrainLayers) return null;

        interface Candidate {
            col: number;
            row: number;
            preference: number;
        }

        const candidates: Candidate[] = [];
        const radiusSq = Math.max(0, radius) * Math.max(0, radius);
        for (let row = 0; row < this.grid.height; row++) {
            for (let col = 0; col < this.grid.width; col++) {
                const effective = this.getEffectiveTerrainType(col, row);
                const floor = this.getFloorTile(col, row);
                if (!isIntactRock(effective, floor?.destructible)) continue;
                const dx = col - centerCol;
                const dy = row - centerRow;
                if (dx * dx + dy * dy > radiusSq) continue;
                const preference = this.terrainLayers.hasFloorTile(col, row) ? 0 : 1;
                candidates.push({ col, row, preference });
            }
        }

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => {
            if (a.preference !== b.preference) return a.preference - b.preference;
            const da = (a.col - centerCol) ** 2 + (a.row - centerRow) ** 2;
            const db = (b.col - centerCol) ** 2 + (b.row - centerRow) ** 2;
            if (da !== db) return da - db;
            if (a.row !== b.row) return a.row - b.row;
            return a.col - b.col;
        });

        const selected = candidates[0]!;
        const previousHealth = this.implicitRockHealth(selected.col, selected.row);
        const floor = this.terrainLayers.ensureFloorFromBedrock(selected.col, selected.row, this.grid);
        const maxHealth = floor.destructible?.maxHealth ?? EARTH_CORE_STONE_HEALTH;
        const previousTerrainType = getEffectiveTerrain(floor, this.grid.get(selected.col, selected.row));

        if (sourceUnitId !== undefined) {
            this.lastRockDamageSourceUnitId = sourceUnitId;
        }

        this.terrainLayers.setFloorTile(selected.col, selected.row, { terrainType: TerrainType.Rubble });
        this.clearPathCache();

        return this.emitStoneDamaged({
            col: selected.col,
            row: selected.row,
            previousHealth,
            health: 0,
            maxHealth,
            previousTerrainType,
            terrainType: TerrainType.Rubble,
            tier: 3,
            sourceUnitId: sourceUnitId ?? this.lastRockDamageSourceUnitId,
        });
    }

    setStoneDamagedEmitter(emitter: ((event: TerrainStoneDamagedTransition) => void) | undefined): void {
        this.onStoneDamaged = emitter;
    }

    private emitStoneDamaged(partial: Omit<TerrainStoneDamagedTransition, 'worldX' | 'worldY'>): TerrainStoneDamagedTransition {
        const world = this.grid.gridToWorld(partial.col, partial.row);
        const event: TerrainStoneDamagedTransition = { ...partial, worldX: world.x, worldY: world.y };
        this.onStoneDamaged?.(event);
        return event;
    }
}
