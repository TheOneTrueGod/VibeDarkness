/**
 * layerEffects - Build ground / air layer effects from map-tool cell lists.
 *
 * Ground and air layers are runtime state on `TerrainLayerManager` (see `terrain/AGENTS.md`);
 * segments do not store them. These helpers turn any cell list from the other map tools
 * (rectangle, road, curve) into a permanent, ownerless `TerrainEffectRecord` that a mission can
 * add at start-up with `engine.terrainLayers.add(...)`.
 */

import type { TerrainEffectRecord, TerrainLayerName } from '../../game/TerrainLayerManager';
import { uniqueCells, type GridCell } from './paintCells';

/** Layers that hold effects; `floor` is persistent cell overrides, not effects. */
export type EffectLayerName = Exclude<TerrainLayerName, 'floor'>;

export interface LayerEffectSpec {
    /** Stable id; must be unique among the mission's terrain effects. */
    id: string;
    layer: EffectLayerName;
    /** Effect-type string from `game/terrainEffects/terrainEffectDefs.ts` (e.g. 'bramble_slow'). */
    effectType: string;
    cells: Iterable<GridCell>;
    /** Effect-specific params; see the effect's def for which keys it reads. */
    params?: Record<string, unknown>;
}

/**
 * Permanent, ownerless layer effect covering `cells`. Placed at game time 0, so effects added
 * later in the battle take precedence on shared cells.
 */
export function createLayerEffect(spec: LayerEffectSpec): TerrainEffectRecord {
    return {
        id: spec.id,
        layer: spec.layer,
        effectType: spec.effectType,
        placedAtGameTime: 0,
        area: { type: 'cells', cells: uniqueCells(spec.cells) },
        params: { ...(spec.params ?? {}) },
    };
}
