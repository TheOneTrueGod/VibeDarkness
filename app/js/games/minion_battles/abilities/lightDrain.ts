/**
 * Light draining helpers shared by every unit that eats light (the Light Eater, the Gloam Lily, ...).
 *
 * Two kinds of light can be drained: special tiles that emit light (campfires, crystals) and free-standing
 * light sources (torches, deployables). Dark light (`DarkLight`) is never a target. A source whose strength
 * is already at or below the amount is put out outright, and stays out: nothing here ever restores light.
 */

import type { SpecialTile } from '../game/specialTiles/SpecialTile';
import type { LightSource } from '../game/lightSources/LightSource';
import { CELL_SIZE } from '../terrain/TerrainGrid';

export type DrainResult = 'reduced' | 'eliminated';

/** The engine pieces draining needs. */
export interface LightDrainEngine {
    specialTiles: readonly SpecialTile[];
    lightSources: readonly LightSource[];
    damageSpecialTile(tileId: string, amount: number): boolean;
}

/** True for tiles that can be drained: still burning, emitting visible (non-dark) light. */
export function isDevourableLight(tile: SpecialTile): boolean {
    return (
        tile.hp > 0 &&
        tile.emitsLight != null &&
        tile.emitsLight.lightAmount > 0 &&
        tile.emitsLight.lightType !== 'DarkLight'
    );
}

/** True for free-standing light sources (torches, deployables, ...) that still emit visible light. */
export function isDevourableLightSource(ls: LightSource): boolean {
    return ls.active && ls.lightAmount > 0 && ls.lightType !== 'DarkLight';
}

export function lightTileCenter(tile: Pick<SpecialTile, 'col' | 'row'>): { x: number; y: number } {
    return { x: tile.col * CELL_SIZE + CELL_SIZE / 2, y: tile.row * CELL_SIZE + CELL_SIZE / 2 };
}

/** Nearest devourable light-emitting special tile to a point, or null when none remain. */
export function findNearestLightTile(
    tiles: readonly SpecialTile[],
    from: { x: number; y: number },
): SpecialTile | null {
    let best: SpecialTile | null = null;
    let bestDistSq = Infinity;
    for (const tile of tiles) {
        if (!isDevourableLight(tile)) continue;
        const c = lightTileCenter(tile);
        const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
        if (d < bestDistSq) {
            best = tile;
            bestDistSq = d;
        }
    }
    return best;
}

/** Nearest devourable free-standing light source to a point, or null when none remain. */
export function findNearestLightSource(
    sources: readonly LightSource[],
    from: { x: number; y: number },
): LightSource | null {
    let best: LightSource | null = null;
    let bestDistSq = Infinity;
    for (const ls of sources) {
        if (!isDevourableLightSource(ls)) continue;
        const d = (ls.x - from.x) ** 2 + (ls.y - from.y) ** 2;
        if (d < bestDistSq) {
            best = ls;
            bestDistSq = d;
        }
    }
    return best;
}

/** AI gate: true when any light (tile or free source) is left to drain. */
export function anyDevourableLight(tiles: readonly SpecialTile[]): boolean {
    return tiles.some(isDevourableLight);
}

/** Eat `amount` strength from a light tile. One already at or below `amount` is eliminated outright. */
export function devourLight(
    engine: Pick<LightDrainEngine, 'damageSpecialTile'>,
    tile: SpecialTile,
    amount: number,
): DrainResult {
    const light = tile.emitsLight;
    if (!light || light.lightAmount <= amount) {
        engine.damageSpecialTile(tile.id, tile.hp);
        return 'eliminated';
    }
    light.lightAmount -= amount;
    return 'reduced';
}

/**
 * Damage a free-standing LightSource by `amount`; one already at or below that is put out. The source's decay
 * baseline is lowered too, otherwise round-end decay would recompute its strength from the original value and
 * quietly undo the damage.
 */
export function devourLightSource(ls: LightSource, amount: number): DrainResult {
    if (ls.lightAmount <= amount) {
        ls.lightAmount = 0;
        ls.active = false;
        return 'eliminated';
    }
    ls.lightAmount -= amount;
    ls.decay.initialLightAmount = Math.max(0, ls.decay.initialLightAmount - amount);
    return 'reduced';
}

/** The light a drain picked: a special tile or a free light source, with its centre. */
export interface DrainLightTarget {
    tileId?: string;
    sourceId?: string;
    x: number;
    y: number;
}

/** Nearest lit light of either kind (within `range` px when given), or null. */
export function findNearestLitLight(
    engine: Pick<LightDrainEngine, 'specialTiles' | 'lightSources'>,
    from: { x: number; y: number },
    range?: number,
): DrainLightTarget | null {
    let best: DrainLightTarget | null = null;
    let bestDistSq = range == null ? Infinity : range * range;
    const tile = findNearestLightTile(engine.specialTiles, from);
    if (tile) {
        const c = lightTileCenter(tile);
        const d = (c.x - from.x) ** 2 + (c.y - from.y) ** 2;
        if (d <= bestDistSq) {
            best = { tileId: tile.id, x: c.x, y: c.y };
            bestDistSq = d;
        }
    }
    const ls = findNearestLightSource(engine.lightSources, from);
    if (ls) {
        const d = (ls.x - from.x) ** 2 + (ls.y - from.y) ** 2;
        if (d <= bestDistSq) best = { sourceId: ls.id, x: ls.x, y: ls.y };
    }
    return best;
}

/** Drain `amount` from a picked light if it is still lit. Returns what happened, or null when it is already out. */
export function drainPickedLight(
    engine: LightDrainEngine,
    picked: DrainLightTarget,
    amount: number,
): DrainResult | null {
    if (picked.tileId != null) {
        const tile = engine.specialTiles.find((t) => t.id === picked.tileId);
        return tile && isDevourableLight(tile) ? devourLight(engine, tile, amount) : null;
    }
    if (picked.sourceId != null) {
        const ls = engine.lightSources.find((s) => s.id === picked.sourceId);
        return ls && isDevourableLightSource(ls) ? devourLightSource(ls, amount) : null;
    }
    return null;
}
