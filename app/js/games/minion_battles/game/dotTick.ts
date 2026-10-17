/**
 * DoT (Damage over Time) tick system.
 *
 * One tick fires every 1/DOT_TICKS_PER_ROUND of a round. Only bleed ticks here; thorn damage is
 * enter/land-only and lives in `terrainEffects/thorns.ts`.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import type { TerrainLayerManager } from './TerrainLayerManager';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';

export const DOT_TICKS_PER_ROUND = 8;

/**
 * @param _dotMilestoneIndex - 0-based index of the DoT milestone about to fire this round.
 *   Unused now that thorns no longer tick; kept so callers needn't change.
 */
export function tickAllDots(
    units: readonly Unit[],
    _terrainLayers: TerrainLayerManager,
    eventBus: EventBus,
    fx?: BleedDamageFxContext,
    _dotMilestoneIndex = 0,
): void {
    tickBleedForRoundMilestone(units, eventBus, fx);
}
