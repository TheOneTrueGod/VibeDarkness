/**
 * TerrainManager - High-level interface for terrain queries and pathfinding.
 *
 * Wraps a TerrainGrid (bedrock) and the pathfinding NavGrid / PathQuery. Sparse floor tiles from
 * TerrainLayerManager override bedrock for effective terrain reads.
 */

import type { TerrainGrid } from './TerrainGrid';
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import {
    EARTH_CORE_STONE_DAMAGE_PER_INSTANCE,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/05_earth_core/earthCoreConstants';
import type { FloorTile, TerrainStoneDamagedTransition } from './FloorTile';
import type { ResolvedSegmentPlacement } from './segmentRegistry';
import {
    DAMAGE_TIER_NONE,
    getDamageTier,
    getEffectiveTerrain,
    isIntactRock,
} from './FloorTile';
import type { TerrainLayerManager } from '../game/TerrainLayerManager';
import { NavGrid } from '../pathfinding/NavGrid';
import { PathQuery } from '../pathfinding/PathQuery';

export type { TerrainStoneDamagedTransition as TerrainStoneDamagedEvent } from './FloorTile';

export class TerrainManager {
    readonly grid: TerrainGrid;
    readonly pathQuery: PathQuery;
    private terrainLayers: TerrainLayerManager | null = null;
    private onStoneDamaged?: (event: TerrainStoneDamagedTransition) => void;
    private lastRockDamageSourceUnitId: string | null = null;
    /** Mission-global segment placement rects, for debug/tooling lookups. See `getSegmentIdAt`. */
    segmentPlacements: ResolvedSegmentPlacement[] = [];

    /** NavGrid for pathfinding (lazily created). */
    private _nav: NavGrid | null = null;
    /** Provider for crystal protection map (called during NavGrid rebuild). */
    private crystalProtectionProvider: () => Map<string, number> = () => new Map();
    /** Epoch incremented whenever passability or cost for any cell changes. */
    navEpoch: number = 0;

    constructor(grid: TerrainGrid) {
        this.grid = grid;
        this.pathQuery = new PathQuery(this);
    }

    /** Set the provider function for crystal protection map (called when NavGrid is rebuilt). */
    setCrystalProtectionProvider(fn: () => Map<string, number>): void {
        this.crystalProtectionProvider = fn;
        // Mark the existing NavGrid (if any) as all dirty since the protection map changed.
        if (this._nav) {
            this._nav.markAllDirty();
        }
    }

    /** Lazily create and return the NavGrid, ensuring it's up-to-date. */
    get nav(): NavGrid {
        if (!this._nav) {
            this._nav = new NavGrid(this, () => this.crystalProtectionProvider());
        }
        this._nav.flush();
        return this._nav;
    }

    /** Bump navEpoch and mark the NavGrid dirty for a specific cell (or all cells if not given). */
    notifyNavChanged(col?: number, row?: number): void {
        this.navEpoch++;
        if (!this._nav) return;

        if (col !== undefined && row !== undefined) {
            this._nav.markDirty(col, row);
        } else {
            this._nav.markAllDirty();
        }
    }

    /** Mark NavGrid dirty without bumping the epoch (used for checkpoint restore). */
    markNavDirty(): void {
        if (this._nav) {
            this._nav.markAllDirty();
        }
    }

    /** Which registered map segment (if any) a grid cell belongs to. Debug/tooling use only. */
    getSegmentIdAt(col: number, row: number): string | null {
        const placement = this.segmentPlacements.find(
            (p) => col >= p.originCol && col < p.originCol + p.width && row >= p.originRow && row < p.originRow + p.height,
        );
        return placement?.id ?? null;
    }

    /** Attach the TerrainLayerManager so floor tiles affect passability and rock queries. */
    setTerrainLayers(layers: TerrainLayerManager): void {
        this.terrainLayers = layers;
        // Invalidate NavGrid since terrain layers have changed.
        if (this._nav) {
            this._nav.markAllDirty();
        }
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

    /**
     * Terrain a projectile sees at a world position, using effective terrain (floor layer included).
     * Outside the grid is reported as Impassable, not as the Rock fallback of `grid.get`, so a
     * projectile cannot "stonephase" its way off the edge of the map.
     */
    getProjectileTerrainAt(worldX: number, worldY: number): TerrainType {
        const { col, row } = this.grid.worldToGrid(worldX, worldY);
        if (!this.isInBounds(col, row)) return TerrainType.Impassable;
        return this.getEffectiveTerrainType(col, row);
    }

    /** True if a projectile is stopped at this world position unless a travel modifier traverses it. */
    isProjectileObstructedAt(worldX: number, worldY: number): boolean {
        return TERRAIN_PROPERTIES[this.getProjectileTerrainAt(worldX, worldY)].blocksProjectiles;
    }

    getGridSize(): { width: number; height: number; cellSize: number } {
        return { width: this.grid.width, height: this.grid.height, cellSize: this.grid.cellSize };
    }

    findGridPath(fromCol: number, fromRow: number, toCol: number, toRow: number): { col: number; row: number }[] | null {
        return this.pathQuery.findCellPath(fromCol, fromRow, toCol, toRow, 'default', 0);
    }

    clearPathCache(): void {
        this.pathQuery.clearCache();
        // Also bump navEpoch and mark the NavGrid as needing rebuild.
        // This is a compatibility entry point for tests that mutate grid.set directly.
        this.notifyNavChanged();
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

        // Check if effective passability actually changes.
        const previousEffective = this.getEffectiveTerrainType(col, row);
        if (previousEffective === TerrainType.Rock) {
            // Already a rock, no change in passability.
            const tile: FloorTile = {
                terrainType: TerrainType.Rock,
                destructible: { health: maxHealth, maxHealth, kind: 'rock' },
            };
            this.terrainLayers.setFloorTile(col, row, tile);
            return { ...tile, destructible: { ...tile.destructible! } };
        }

        const tile: FloorTile = {
            terrainType: TerrainType.Rock,
            destructible: { health: maxHealth, maxHealth, kind: 'rock' },
        };
        this.terrainLayers.setFloorTile(col, row, tile);

        // Effective passability changed from passable to impassable.
        this.notifyNavChanged(col, row);
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

        // Bump navEpoch only if effective passability changed (rock destroyed).
        const destroyed = nextTerrainType === TerrainType.Rubble;
        if (destroyed) {
            this.notifyNavChanged(col, row);
        }

        const nextTier = nextHealth <= 0 ? DAMAGE_TIER_NONE : getDamageTier(floor.destructible);
        const tierChanged = nextTier !== previousTier;

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
        return this.destroyRock(selected.col, selected.row, sourceUnitId);
    }

    /** True when (col, row) is inside the grid. Out-of-bounds cells read as Rock from `grid.get`, so check first. */
    isInBounds(col: number, row: number): boolean {
        return col >= 0 && row >= 0 && col < this.grid.width && row < this.grid.height;
    }

    /** True when (col, row) is in bounds and its effective terrain is intact rock (see `isIntactRock`). */
    isIntactRockAt(col: number, row: number): boolean {
        if (!this.isInBounds(col, row)) return false;
        return isIntactRock(this.getEffectiveTerrainType(col, row), this.getFloorTile(col, row)?.destructible);
    }

    /**
     * Destroy one intact rock tile (bedrock or player-made) and leave Rubble behind. Emits the same
     * stone-damaged transition a destroying `damageRock` emits (health 0, tier DAMAGE_TIER_NONE).
     * Returns null when the tile is not intact rock, so callers can treat it as a no-op.
     */
    destroyRock(col: number, row: number, sourceUnitId?: string | null): TerrainStoneDamagedTransition | null {
        if (!this.terrainLayers) return null;
        if (!this.isIntactRockAt(col, row)) return null;

        const previousFloor = this.getFloorTile(col, row);
        const previousHealth = this.implicitRockHealth(col, row);
        const maxHealth = previousFloor?.destructible?.maxHealth ?? EARTH_CORE_STONE_HEALTH;
        const previousTerrainType = this.getEffectiveTerrainType(col, row);

        if (sourceUnitId !== undefined) {
            this.lastRockDamageSourceUnitId = sourceUnitId;
        }

        this.terrainLayers.setFloorTile(col, row, { terrainType: TerrainType.Rubble });

        // Destroyed rock changes effective passability, so bump navEpoch and mark the cell dirty.
        this.notifyNavChanged(col, row);

        return this.emitStoneDamaged({
            col,
            row,
            previousHealth,
            health: 0,
            maxHealth,
            previousTerrainType,
            terrainType: TerrainType.Rubble,
            tier: DAMAGE_TIER_NONE,
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
