/**
 * Light Hate — reusable keyword: high battlefield light at a unit weakens it.
 *
 * Light level uses the same grid as darkness overlay (see LightGrid + engine light sources).
 */

import type { Unit } from './units/Unit';
import { getLightGrid, type LightSource } from './LightGrid';
import { DarknessLevel } from './darknessLevels';
import type { TerrainGrid } from '../terrain/TerrainGrid';

export type LightHateDef = {
    /** When tile light >= threshold, Light Hate is considered active (enemy weakened). */
    threshold: number;
};

/** Per-character Light Hate parameters for enemies that opt in. */
export const LIGHT_HATE_DEFS: Partial<Record<string, LightHateDef>> = {
    thornbinder: { threshold: DarknessLevel.BRIGHT_LIGHT },
    husk_artillery: { threshold: DarknessLevel.BRIGHT_LIGHT },
};

export function getLightHateDef(characterId: string): LightHateDef | undefined {
    return LIGHT_HATE_DEFS[characterId];
}

export function getLightLevelAtWorldPx(
    x: number,
    y: number,
    args: {
        lightLevelEnabled: boolean;
        globalLightLevel: number;
        grid: TerrainGrid | null | undefined;
        sources: LightSource[];
    },
): number {
    if (!args.lightLevelEnabled || !args.grid) return 0;
    const grid = args.grid;
    const { col, row } = grid.worldToGrid(x, y);
    const w = grid.width;
    const h = grid.height;
    const safeRow = Math.max(0, Math.min(h - 1, row));
    const safeCol = Math.max(0, Math.min(w - 1, col));
    const lg = getLightGrid(args.globalLightLevel, w, h, args.sources);
    return lg[safeRow]![safeCol]!;
}

/** True when this unit's tile is bright enough to trigger Light Hate weakening. */
export function isLightHateWeakened(
    unit: Unit,
    engine: {
        lightLevelEnabled: boolean;
        globalLightLevel: number;
        terrainManager: { grid: TerrainGrid } | null;
        getAllLightSources(): LightSource[];
    },
): boolean {
    const def = getLightHateDef(unit.characterId);
    if (!def) return false;
    const level = getLightLevelAtWorldPx(unit.x, unit.y, {
        lightLevelEnabled: engine.lightLevelEnabled,
        globalLightLevel: engine.globalLightLevel,
        grid: engine.terrainManager?.grid,
        sources: engine.getAllLightSources(),
    });
    return level >= def.threshold;
}
