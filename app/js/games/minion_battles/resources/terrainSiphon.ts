/**
 * Terrain siphon — a reusable, data-driven way for a resource to fill by draining nearby terrain.
 *
 * A {@link TerrainSiphonConfig} names which terrains are drawn on, how far around the unit, how
 * many tiles at most, how fast each tile drains and how fast the resource fills. Tiles are drained
 * through `TerrainManager.drainWater`, so a tile that runs dry drops a level exactly like any other
 * water change (pathfinding, floor layer, `terrain_water_drained`).
 *
 * Deterministic by construction: no engine RNG, a total order on tile selection, and the same
 * floating-point operations on every client.
 */

import type { EngineContext } from '../game/EngineContext';
import type { TerrainManager } from '../terrain/TerrainManager';
import { TERRAIN_PROPERTIES, type TerrainType } from '../terrain/TerrainType';
import type { Resource } from './Resource';

export interface TerrainSiphonConfig {
    /** Terrain types the siphon can draw on (they must be drainable through `drainWater`). */
    terrains: readonly TerrainType[];
    /** Cells around the unit's cell that count as "beside" it. 1 = the 3x3. */
    radiusCells: number;
    /** Most tiles drawn on at once. */
    maxTiles: number;
    /** Fraction of a tile's water level removed per second while it is drawn on. */
    drainPerTilePerSec: number;
    /** Resource gained per second while at least one tile is drawn on (independent of tile count). */
    gainPerSec: number;
}

export interface SiphonTile {
    col: number;
    row: number;
    terrainType: TerrainType;
}

/** Minimal unit shape the siphon reads (a world position). */
export interface SiphonUnit {
    x: number;
    y: number;
}

interface SiphonCandidate extends SiphonTile {
    depth: number;
    distanceSq: number;
}

/**
 * Tiles the siphon draws on this tick, at most `config.maxTiles`. Order (a total order, so every
 * client picks the same tiles): deepest first (`TerrainProperties.waterLevel`), then nearest to the
 * unit's cell (own cell, then orthogonal, then diagonal), then row, then column.
 */
export function pickSiphonTiles(
    unit: SiphonUnit,
    terrain: TerrainManager,
    config: TerrainSiphonConfig,
): SiphonTile[] {
    if (config.maxTiles <= 0 || config.terrains.length === 0) return [];
    const { cellSize } = terrain.getGridSize();
    const centerCol = Math.floor(unit.x / cellSize);
    const centerRow = Math.floor(unit.y / cellSize);
    const radius = Math.max(0, Math.floor(config.radiusCells));

    const candidates: SiphonCandidate[] = [];
    for (let row = centerRow - radius; row <= centerRow + radius; row++) {
        for (let col = centerCol - radius; col <= centerCol + radius; col++) {
            if (!terrain.isInBounds(col, row)) continue;
            const terrainType = terrain.getEffectiveTerrainType(col, row);
            if (!config.terrains.includes(terrainType)) continue;
            const dc = col - centerCol;
            const dr = row - centerRow;
            candidates.push({
                col,
                row,
                terrainType,
                depth: TERRAIN_PROPERTIES[terrainType].waterLevel ?? 0,
                distanceSq: dc * dc + dr * dr,
            });
        }
    }

    candidates.sort((a, b) =>
        b.depth - a.depth
        || a.distanceSq - b.distanceSq
        || a.row - b.row
        || a.col - b.col);

    return candidates
        .slice(0, config.maxTiles)
        .map(({ col, row, terrainType }) => ({ col, row, terrainType }));
}

/** Live gain per second the siphon would give right now (0 when full or away from the terrain). */
export function terrainSiphonGainPerSec(
    resource: Pick<Resource, 'current' | 'max'>,
    unit: SiphonUnit,
    terrain: TerrainManager | null,
    config: TerrainSiphonConfig,
): number {
    if (!terrain || resource.current >= resource.max) return 0;
    return pickSiphonTiles(unit, terrain, config).length > 0 ? config.gainPerSec : 0;
}

/**
 * One tick of the siphon. Does nothing at max or without terrain. Otherwise drains each picked tile
 * by `drainPerTilePerSec * dt` and adds `gainPerSec * dt` to the resource (clamped to max). Returns
 * the tiles drawn on.
 */
export function tickTerrainSiphon(
    resource: Resource,
    unit: SiphonUnit & { id: string },
    engine: Pick<EngineContext, 'terrainManager'>,
    dt: number,
    config: TerrainSiphonConfig,
): SiphonTile[] {
    const terrain = engine.terrainManager;
    if (!terrain || !(dt > 0) || resource.current >= resource.max) return [];
    const tiles = pickSiphonTiles(unit, terrain, config);
    if (tiles.length === 0) return [];
    const fraction = config.drainPerTilePerSec * dt;
    for (const tile of tiles) {
        terrain.drainWater(tile.col, tile.row, fraction, unit.id);
    }
    resource.add(config.gainPerSec * dt);
    return tiles;
}
