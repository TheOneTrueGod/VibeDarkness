/**
 * Terrain clearing: specs describing which ground/air effects to erase, and the engine entry point
 * that applies a spec to tiles. The floor layer (rock, rubble, ...) is never cleared.
 */

import type { TeamId } from '../teams';
import type { EventBus } from '../EventBus';
import type { TileCoord } from '../../abilities/tileAreaHelpers';
import {
    rasterizeArea,
    type ClearedTerrainEffect,
    type TerrainEffectArea,
    type TerrainEffectRecord,
    type TerrainLayerManager,
} from '../TerrainLayerManager';
import { getTerrainEffectDef } from './terrainEffectDefs';
import { PERF_ENGINE, PERF_TERRAIN_CLEAR, tickPerformanceTracker } from '../performance/tickPerformanceTracker';

export interface TerrainClearSpec {
    /** Layers to clear. Never the floor layer. */
    layers: ReadonlyArray<'ground' | 'air'>;
    /** If set, only these effect types are cleared. */
    effectTypes?: readonly string[];
    /** Effect types that are never cleared by this spec. */
    excludeEffectTypes?: readonly string[];
    /** Team filter on the record's owning team. Records with no team only match `exclude`-style filters. */
    teams?: { include?: readonly TeamId[]; exclude?: readonly TeamId[] };
}

export const TERRAIN_CLEARS = {
    /** Ground layer only (rock slides, stone strikes). */
    scour: { layers: ['ground'] },
    /** Air layer only (wind). */
    gust: { layers: ['air'] },
    /** Ground and air (explosions). */
    blast: { layers: ['ground', 'air'] },
} as const satisfies Record<string, TerrainClearSpec>;

export type TerrainClearPresetName = keyof typeof TERRAIN_CLEARS;

/** True when `record` should be cleared by `spec`. A `clearResistant` effect def always wins. */
export function matchesClearSpec(record: TerrainEffectRecord, spec: TerrainClearSpec): boolean {
    if (record.layer !== 'ground' && record.layer !== 'air') return false;
    if (!spec.layers.includes(record.layer)) return false;
    if (getTerrainEffectDef(record.effectType)?.clearResistant) return false;
    if (spec.effectTypes && !spec.effectTypes.includes(record.effectType)) return false;
    if (spec.excludeEffectTypes?.includes(record.effectType)) return false;
    const teams = spec.teams;
    if (teams) {
        if (teams.include && (record.teamId === undefined || !teams.include.includes(record.teamId))) return false;
        if (teams.exclude && record.teamId !== undefined && teams.exclude.includes(record.teamId)) return false;
    }
    return true;
}

export interface TerrainClearContext {
    terrainLayers: TerrainLayerManager;
    eventBus: EventBus;
}

export interface TerrainClearSource {
    unitId?: string;
    abilityId?: string;
}

/**
 * Clear ground/air effects matching `spec` from `target` (tiles, or an area that is rasterized).
 * Emits `terrain_effects_cleared` when anything was cleared. Returns what was cleared.
 */
export function clearTerrainEffects(
    ctx: TerrainClearContext,
    target: TileCoord[] | TerrainEffectArea,
    spec: TerrainClearSpec,
    source?: TerrainClearSource,
): ClearedTerrainEffect[] {
    // Nest under the caller's active scope (e.g. engine.projectiles); otherwise under the engine root.
    const path = tickPerformanceTracker.isInScope() ? [PERF_TERRAIN_CLEAR] : [PERF_ENGINE, PERF_TERRAIN_CLEAR];
    return tickPerformanceTracker.measure(
        path,
        () => {
            const cells = Array.isArray(target) ? target : rasterizeArea(target);
            const cleared = ctx.terrainLayers.clearCells(cells, (record) => matchesClearSpec(record, spec));
            if (cleared.length > 0) {
                ctx.eventBus.emit('terrain_effects_cleared', { cleared, source });
            }
            return cleared;
        },
        { level: 'verbose' },
    );
}
