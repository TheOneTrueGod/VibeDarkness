/**
 * DoT (Damage over Time) tick system.
 *
 * One tick fires every 1/DOT_TICKS_PER_ROUND of a round. All damage-over-time
 * effects — bleed, bramble, etc. — are processed together at each tick.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import type { TerrainLayerManager } from './TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';

export const DOT_TICKS_PER_ROUND = 8;

function tickBramble(units: readonly Unit[], terrainLayers: TerrainLayerManager, eventBus: EventBus): void {
    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const col = Math.floor(unit.x / CELL_SIZE);
        const row = Math.floor(unit.y / CELL_SIZE);
        const effect = terrainLayers.getGroundEffectAt(col, row);
        if (effect?.effectType === 'bramble_slow') {
            unit.takeDamage(1, effect.ownerUnitId ?? null, eventBus);
        }
    }
}

export function tickAllDots(
    units: readonly Unit[],
    terrainLayers: TerrainLayerManager,
    eventBus: EventBus,
    fx?: BleedDamageFxContext,
): void {
    tickBleedForRoundMilestone(units, eventBus, fx);
    tickBramble(units, terrainLayers, eventBus);
}
