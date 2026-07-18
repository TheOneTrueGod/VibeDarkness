import { CELL_SIZE } from '../terrain/TerrainGrid';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';
import type { FloorTile } from '../terrain/FloorTile';
import { floorTileFromBedrock } from '../terrain/FloorTile';
import {
    DEFAULT_ROCK_DESTRUCTIBLE_KIND,
    EARTH_CORE_STONE_HEALTH,
} from '../card_defs/05_earth_core/earthCoreConstants';

export type TerrainLayerName = 'floor' | 'ground' | 'air';

export type TerrainEffectArea =
    | { type: 'circle'; x: number; y: number; radiusPx: number }
    | { type: 'cell'; col: number; row: number }
    | { type: 'cells'; cells: Array<{ col: number; row: number }> };

export interface TerrainEffectRecord {
    id: string;
    layer: TerrainLayerName;
    /** Discriminator for interpreting params (e.g. 'bramble_slow'). */
    effectType: string;
    /** Used for oldest-wins cell ownership. */
    placedAtGameTime: number;
    /** Undefined = permanent (floor effects). */
    expiresAtGameTime?: number;
    ownerUnitId?: string;
    ownerAbilityId?: string;
    area: TerrainEffectArea;
    /** Mutable effect-specific state (e.g. { slowMult: 0.52 }). */
    params: Record<string, unknown>;
}

export interface SerializedFloorTileEntry {
    col: number;
    row: number;
    tile: FloorTile;
}

const ROCK_FLOOR_EFFECT_TYPES = new Set(['created_rock', 'rock_state']);

function cellKey(col: number, row: number): string {
    return `${col},${row}`;
}

function parseCellKey(key: string): { col: number; row: number } {
    const [colStr, rowStr] = key.split(',');
    return { col: Number(colStr), row: Number(rowStr) };
}

/** Returns all grid cells whose center falls within the given area. */
export function rasterizeArea(area: TerrainEffectArea): Array<{ col: number; row: number }> {
    if (area.type === 'cell') {
        return [{ col: area.col, row: area.row }];
    }
    if (area.type === 'cells') {
        return area.cells.map((c) => ({ ...c }));
    }
    // circle: include cells whose center is within radiusPx of (x, y)
    const cells: Array<{ col: number; row: number }> = [];
    const radiusCells = area.radiusPx / CELL_SIZE;
    const centerColF = area.x / CELL_SIZE;
    const centerRowF = area.y / CELL_SIZE;
    const minCol = Math.floor(centerColF - radiusCells);
    const maxCol = Math.ceil(centerColF + radiusCells);
    const minRow = Math.floor(centerRowF - radiusCells);
    const maxRow = Math.ceil(centerRowF + radiusCells);
    const r2 = area.radiusPx * area.radiusPx;
    for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
            const cx = col * CELL_SIZE + CELL_SIZE / 2;
            const cy = row * CELL_SIZE + CELL_SIZE / 2;
            const dx = cx - area.x;
            const dy = cy - area.y;
            if (dx * dx + dy * dy <= r2) {
                cells.push({ col, row });
            }
        }
    }
    return cells;
}

/**
 * Decides which of two effects covering the same cell takes precedence.
 * Currently "newest wins" (ties favor the candidate). Centralized here so the
 * precedence policy can be changed in one place without touching call sites.
 */
function effectTakesPrecedence(candidate: TerrainEffectRecord, existing: TerrainEffectRecord): boolean {
    return candidate.placedAtGameTime >= existing.placedAtGameTime;
}

/** Returns true if the effect's area geometrically covers cell (col, row). */
function effectCoversCell(record: TerrainEffectRecord, col: number, row: number): boolean {
    const area = record.area;
    if (area.type === 'cell') {
        return area.col === col && area.row === row;
    }
    if (area.type === 'cells') {
        return area.cells.some((c) => c.col === col && c.row === row);
    }
    // circle: test cell center
    const cx = col * CELL_SIZE + CELL_SIZE / 2;
    const cy = row * CELL_SIZE + CELL_SIZE / 2;
    const dx = cx - area.x;
    const dy = cy - area.y;
    return dx * dx + dy * dy <= area.radiusPx * area.radiusPx;
}

function migrateLegacyRockEffect(record: TerrainEffectRecord): SerializedFloorTileEntry[] {
    if (!ROCK_FLOOR_EFFECT_TYPES.has(record.effectType)) return [];
    const cells = rasterizeArea(record.area);
    const state = record.params.state as string | undefined;
    const health = typeof record.params.health === 'number' ? record.params.health : EARTH_CORE_STONE_HEALTH;
    const maxHealth = EARTH_CORE_STONE_HEALTH;
    const entries: SerializedFloorTileEntry[] = [];
    for (const { col, row } of cells) {
        if (state === 'spent_rubble') {
            entries.push({ col, row, tile: { terrainType: TerrainType.Rubble } });
        } else {
            entries.push({
                col,
                row,
                tile: {
                    terrainType: TerrainType.Rock,
                    destructible: {
                        health,
                        maxHealth,
                        kind: DEFAULT_ROCK_DESTRUCTIBLE_KIND,
                    },
                },
            });
        }
    }
    return entries;
}

/**
 * Layered terrain system. Floor tiles (sparse authoritative overrides) are stored
 * separately from ground/air effect overlays (e.g. bramble_slow).
 */
export class TerrainLayerManager {
    private effectRegistry = new Map<string, TerrainEffectRecord>();
    private floorCells = new Map<string, string>();   // cellKey → effectId (ground/air only in practice)
    private groundCells = new Map<string, string>();
    private airCells = new Map<string, string>();
    private floorTiles = new Map<string, FloorTile>();

    private getCellMap(layer: TerrainLayerName): Map<string, string> {
        if (layer === 'floor') return this.floorCells;
        if (layer === 'ground') return this.groundCells;
        return this.airCells;
    }

    // -------------------------------------------------------------------------
    // Floor tile API (authoritative sparse overrides)
    // -------------------------------------------------------------------------

    getFloorTile(col: number, row: number): FloorTile | null {
        return this.floorTiles.get(cellKey(col, row)) ?? null;
    }

    hasFloorTile(col: number, row: number): boolean {
        return this.floorTiles.has(cellKey(col, row));
    }

    setFloorTile(col: number, row: number, tile: FloorTile): void {
        this.floorTiles.set(cellKey(col, row), { ...tile, destructible: tile.destructible ? { ...tile.destructible } : undefined });
    }

    ensureFloorFromBedrock(col: number, row: number, bedrock: TerrainGrid, maxHealth: number = EARTH_CORE_STONE_HEALTH): FloorTile {
        const existing = this.getFloorTile(col, row);
        if (existing) return existing;
        const tile = floorTileFromBedrock(bedrock.get(col, row), maxHealth);
        this.setFloorTile(col, row, tile);
        return tile;
    }

    /** Iterate all floor tile entries (for rendering and serialization). */
    getFloorTileEntries(): SerializedFloorTileEntry[] {
        const entries: SerializedFloorTileEntry[] = [];
        for (const [key, tile] of this.floorTiles) {
            const { col, row } = parseCellKey(key);
            entries.push({
                col,
                row,
                tile: { ...tile, destructible: tile.destructible ? { ...tile.destructible } : undefined },
            });
        }
        return entries;
    }

    loadFloorTiles(entries: SerializedFloorTileEntry[]): void {
        this.floorTiles.clear();
        for (const { col, row, tile } of entries) {
            this.setFloorTile(col, row, tile);
        }
    }

    /**
     * Add an effect to the manager. For each cell in the effect's area, the
     * effect claims the cell unless an existing effect there takes precedence
     * (see effectTakesPrecedence).
     */
    add(record: TerrainEffectRecord): void {
        const cells = rasterizeArea(record.area);
        const layerMap = this.getCellMap(record.layer);
        for (const { col, row } of cells) {
            const key = cellKey(col, row);
            const existingId = layerMap.get(key);
            if (existingId !== undefined) {
                const existing = this.effectRegistry.get(existingId);
                if (existing && !effectTakesPrecedence(record, existing)) {
                    continue; // existing takes precedence; new effect does not claim this cell
                }
            }
            layerMap.set(key, record.id);
        }
        this.effectRegistry.set(record.id, record);
    }

    /**
     * Remove an effect by id. Cells it owned are reclaimed by whichever
     * remaining effect on the same layer takes precedence for each vacated cell
     * (see effectTakesPrecedence).
     */
    remove(id: string): void {
        const record = this.effectRegistry.get(id);
        if (!record) return;
        this.effectRegistry.delete(id);

        const cells = rasterizeArea(record.area);
        const layerMap = this.getCellMap(record.layer);

        const vacated: Array<{ col: number; row: number }> = [];
        for (const { col, row } of cells) {
            const key = cellKey(col, row);
            if (layerMap.get(key) === id) {
                layerMap.delete(key);
                vacated.push({ col, row });
            }
        }

        if (vacated.length === 0) return;

        for (const { col, row } of vacated) {
            const key = cellKey(col, row);
            let winner: TerrainEffectRecord | null = null;
            for (const e of this.effectRegistry.values()) {
                if (e.layer !== record.layer) continue;
                if (!effectCoversCell(e, col, row)) continue;
                if (!winner || effectTakesPrecedence(e, winner)) {
                    winner = e;
                }
            }
            if (winner) layerMap.set(key, winner.id);
        }
    }

    /** Remove all effects whose expiresAtGameTime has passed. Call once per tick cleanup. */
    cleanupExpired(gameTime: number): void {
        const toRemove: string[] = [];
        for (const [id, record] of this.effectRegistry) {
            if (record.expiresAtGameTime !== undefined && record.expiresAtGameTime <= gameTime) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) this.remove(id);
    }

    /** Mutate effect params in-place. Does not change cell ownership. */
    updateEffectParams(id: string, newParams: Partial<Record<string, unknown>>): void {
        const record = this.effectRegistry.get(id);
        if (!record) return;
        Object.assign(record.params, newParams);
    }

    // -------------------------------------------------------------------------
    // Layer queries (ground/air overlays)
    // -------------------------------------------------------------------------

    getGroundEffectAt(col: number, row: number): TerrainEffectRecord | null {
        const id = this.groundCells.get(cellKey(col, row));
        return id !== undefined ? (this.effectRegistry.get(id) ?? null) : null;
    }

    getAirEffectAt(col: number, row: number): TerrainEffectRecord | null {
        const id = this.airCells.get(cellKey(col, row));
        return id !== undefined ? (this.effectRegistry.get(id) ?? null) : null;
    }

    /**
     * Returns the movement speed multiplier from ground-layer effects at a world position.
     * Reads params.slowMult from the owning ground effect (default 1.0 if none).
     */
    getGroundMovementMultiplier(worldX: number, worldY: number): number {
        const col = Math.floor(worldX / CELL_SIZE);
        const row = Math.floor(worldY / CELL_SIZE);
        const effect = this.getGroundEffectAt(col, row);
        if (!effect) return 1;
        const slowMult = effect.params.slowMult;
        return typeof slowMult === 'number' ? slowMult : 1;
    }

    /**
     * Returns how many movement-recovery slow stacks are active at a world position.
     * Reads params.movementRecoverySlow from the owning ground effect (default 0 if none).
     * A tall_grass terrain effect would set params: { movementRecoverySlow: 1 }.
     */
    getGroundMovementRecoverySlowStacks(worldX: number, worldY: number): number {
        const col = Math.floor(worldX / CELL_SIZE);
        const row = Math.floor(worldY / CELL_SIZE);
        const effect = this.getGroundEffectAt(col, row);
        if (!effect) return 0;
        const slowStacks = effect.params.movementRecoverySlow;
        return typeof slowStacks === 'number' ? slowStacks : 0;
    }

    /** All effect records (read-only view). Used by renderers for ground/air overlays. */
    get allEffects(): ReadonlyMap<string, TerrainEffectRecord> {
        return this.effectRegistry;
    }

    // -------------------------------------------------------------------------
    // Serialization
    // -------------------------------------------------------------------------

    toEffectsJSON(): Record<string, unknown>[] {
        return Array.from(this.effectRegistry.values())
            .filter((r) => !ROCK_FLOOR_EFFECT_TYPES.has(r.effectType))
            .map((r) => ({
                id: r.id,
                layer: r.layer,
                effectType: r.effectType,
                placedAtGameTime: r.placedAtGameTime,
                expiresAtGameTime: r.expiresAtGameTime,
                ownerUnitId: r.ownerUnitId,
                ownerAbilityId: r.ownerAbilityId,
                area: r.area,
                params: { ...r.params },
            }));
    }

    toFloorTilesJSON(): SerializedFloorTileEntry[] {
        return this.getFloorTileEntries();
    }

    static fromJSON(
        effects: Record<string, unknown>[],
        floorTiles: SerializedFloorTileEntry[] = [],
    ): TerrainLayerManager {
        const mgr = new TerrainLayerManager();
        const migratedFloor: SerializedFloorTileEntry[] = [...floorTiles];
        const groundAirEffects: TerrainEffectRecord[] = [];

        for (const item of effects) {
            const record = item as unknown as TerrainEffectRecord;
            if (ROCK_FLOOR_EFFECT_TYPES.has(record.effectType)) {
                migratedFloor.push(...migrateLegacyRockEffect(record));
            } else {
                groundAirEffects.push(record);
            }
        }

        mgr.loadFloorTiles(migratedFloor);
        for (const record of groundAirEffects) {
            mgr.add(record);
        }
        return mgr;
    }
}
