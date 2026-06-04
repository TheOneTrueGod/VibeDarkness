import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainType } from '../terrain/TerrainType';

export type TerrainLayerName = 'floor' | 'ground' | 'air';

export type TerrainEffectArea =
    | { type: 'circle'; x: number; y: number; radiusPx: number }
    | { type: 'cell'; col: number; row: number }
    | { type: 'cells'; cells: Array<{ col: number; row: number }> };

export interface TerrainEffectRecord {
    id: string;
    layer: TerrainLayerName;
    /** Discriminator for interpreting params (e.g. 'bramble_slow', 'created_rock', 'rock_state'). */
    effectType: string;
    /** Used for oldest-wins cell ownership. */
    placedAtGameTime: number;
    /** Undefined = permanent (floor effects). */
    expiresAtGameTime?: number;
    ownerUnitId?: string;
    ownerAbilityId?: string;
    area: TerrainEffectArea;
    /** Mutable effect-specific state (e.g. { slowMult: 0.52 } or { state: 'cracked_rock', health: 18 }). */
    params: Record<string, unknown>;
}

function cellKey(col: number, row: number): string {
    return `${col},${row}`;
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

/**
 * Layered terrain effect system. Stores TerrainEffectRecord entries across three
 * layers (floor, ground, air). Each layer enforces one-effect-per-cell with
 * oldest-placement winning contested cells.
 *
 * Serialized form: `effectRegistry` as a flat array. Cell maps are derived on load.
 */
export class TerrainLayerManager {
    private effectRegistry = new Map<string, TerrainEffectRecord>();
    private floorCells = new Map<string, string>();   // cellKey → effectId
    private groundCells = new Map<string, string>();
    private airCells = new Map<string, string>();

    private getCellMap(layer: TerrainLayerName): Map<string, string> {
        if (layer === 'floor') return this.floorCells;
        if (layer === 'ground') return this.groundCells;
        return this.airCells;
    }

    /**
     * Add an effect to the manager. For each cell in the effect's area, the
     * effect claims the cell only if no older effect already owns it.
     */
    add(record: TerrainEffectRecord): void {
        const cells = rasterizeArea(record.area);
        const layerMap = this.getCellMap(record.layer);
        for (const { col, row } of cells) {
            const key = cellKey(col, row);
            const existingId = layerMap.get(key);
            if (existingId !== undefined) {
                const existing = this.effectRegistry.get(existingId);
                if (existing && existing.placedAtGameTime <= record.placedAtGameTime) {
                    continue; // existing is older or tied; new effect does not claim this cell
                }
            }
            layerMap.set(key, record.id);
        }
        this.effectRegistry.set(record.id, record);
    }

    /**
     * Remove an effect by id. Cells it owned are reclaimed by the oldest
     * remaining effect on the same layer that covers each vacated cell.
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
            let oldest: TerrainEffectRecord | null = null;
            for (const e of this.effectRegistry.values()) {
                if (e.layer !== record.layer) continue;
                if (!effectCoversCell(e, col, row)) continue;
                if (!oldest || e.placedAtGameTime < oldest.placedAtGameTime) {
                    oldest = e;
                }
            }
            if (oldest) layerMap.set(key, oldest.id);
        }
    }

    /** Remove all effects owned by a unit, optionally filtered to a specific layer. */
    removeByOwner(ownerUnitId: string, layer?: TerrainLayerName): void {
        const toRemove: string[] = [];
        for (const [id, record] of this.effectRegistry) {
            if (record.ownerUnitId === ownerUnitId && (layer === undefined || record.layer === layer)) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) this.remove(id);
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

    /** Mutate effect params in-place (e.g. rock damage state update). Does not change cell ownership. */
    updateEffectParams(id: string, newParams: Partial<Record<string, unknown>>): void {
        const record = this.effectRegistry.get(id);
        if (!record) return;
        Object.assign(record.params, newParams);
    }

    // -------------------------------------------------------------------------
    // Layer queries
    // -------------------------------------------------------------------------

    getFloorEffectAt(col: number, row: number): TerrainEffectRecord | null {
        const id = this.floorCells.get(cellKey(col, row));
        return id !== undefined ? (this.effectRegistry.get(id) ?? null) : null;
    }

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
     * Returns the effective TerrainType at a cell, accounting for floor-layer overrides.
     * Returns null if no floor override exists (caller should use bedrock).
     *
     * Floor effectTypes with rock semantics:
     *   'created_rock' | 'rock_state' with params.state:
     *     'created_rock' | 'cracked_rock'  → TerrainType.Rock (impassable)
     *     'spent_rubble'                   → TerrainType.Dirt (passable)
     */
    getFloorTerrainOverride(col: number, row: number): TerrainType | null {
        const effect = this.getFloorEffectAt(col, row);
        if (!effect) return null;
        if (effect.effectType === 'created_rock' || effect.effectType === 'rock_state') {
            const state = effect.params.state as string | undefined;
            return state === 'spent_rubble' ? TerrainType.Dirt : TerrainType.Rock;
        }
        return null;
    }

    /** All effect records (read-only view). Used by TerrainManager for rock queries. */
    get allEffects(): ReadonlyMap<string, TerrainEffectRecord> {
        return this.effectRegistry;
    }

    // -------------------------------------------------------------------------
    // Serialization
    // -------------------------------------------------------------------------

    toJSON(): Record<string, unknown>[] {
        return Array.from(this.effectRegistry.values()).map((r) => ({
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

    static fromJSON(data: Record<string, unknown>[]): TerrainLayerManager {
        const mgr = new TerrainLayerManager();
        for (const item of data) {
            mgr.add(item as unknown as TerrainEffectRecord);
        }
        return mgr;
    }
}
