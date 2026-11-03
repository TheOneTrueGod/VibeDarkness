/**
 * Def-driven lingering hazards. Any ground/air effect whose `TerrainEffectDef` has a
 * `standingDamage` block pulses damage into matching units standing in a cell it owns.
 * Pulses land on world-clock boundaries (`floor(gameTime / intervalSec)` ticking over), so the
 * rule is stateless and identical across clients. To add a variant: add a def entry with
 * `standingDamage` (terrainEffectDefs.ts) plus a visual entry (GameRenderer/terrainEffectDefs.ts).
 */

import type { EventBus } from '../EventBus';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { Unit } from '../units/Unit';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getTerrainEffectDef } from './terrainEffectDefs';
import { unitMatchesCreatureFilter } from './thorns';
import { isUnitAirborne } from './tileTransitions';

export interface StandingDamageEngine {
    terrainLayers: TerrainLayerManager;
    eventBus: EventBus;
    gameTime: number;
}

const LAYERS = ['ground', 'air'] as const;

/** Apply this tick's standing-damage pulses to one unit. `dt` is the world time just elapsed. */
export function tickStandingTerrainDamage(unit: Unit, dt: number, engine: StandingDamageEngine): void {
    if (!unit.active || !unit.isAlive()) return;
    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    for (const layer of LAYERS) {
        const effect = engine.terrainLayers.getEffectAt(layer, col, row);
        if (!effect) continue;
        const standing = getTerrainEffectDef(effect.effectType)?.standingDamage;
        if (!standing) continue;
        const prevPulse = Math.floor((engine.gameTime - dt) / standing.intervalSec);
        const currPulse = Math.floor(engine.gameTime / standing.intervalSec);
        if (currPulse <= prevPulse) continue;
        if (layer === 'ground' && isUnitAirborne(unit)) continue;
        if (!unitMatchesCreatureFilter(standing.hurts, unit)) continue;
        unit.takeDamage(standing.damage, effect.ownerUnitId ?? null, engine.eventBus);
        if (!unit.isAlive()) return;
    }
}
