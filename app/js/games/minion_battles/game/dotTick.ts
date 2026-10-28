/**
 * DoT (Damage over Time) tick system.
 *
 * One milestone fires every 1/DOT_TICKS_PER_ROUND of a round. Bleed fires on every
 * milestone. Thorn damage is enter/land-only and lives in `terrainEffects/thorns.ts`.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import type { TerrainLayerManager } from './TerrainLayerManager';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';

export const DOT_TICKS_PER_ROUND = 8;
/** Bleed damage pulses per round. Matches the DoT clock: once every eighth of a round. */
export const BLEED_TICKS_PER_ROUND = DOT_TICKS_PER_ROUND;

/** True on the DoT milestones where bleed damage lands. */
export function isBleedDotMilestone(dotMilestoneIndex: number): boolean {
    const stride = DOT_TICKS_PER_ROUND / BLEED_TICKS_PER_ROUND;
    return dotMilestoneIndex % stride === 0;
}

/**
 * @param dotMilestoneIndex - 0-based index of the DoT milestone about to fire this round.
 *   Bleed lands when {@link isBleedDotMilestone} is true.
 */
export function tickAllDots(
    units: readonly Unit[],
    _terrainLayers: TerrainLayerManager,
    eventBus: EventBus,
    fx?: BleedDamageFxContext,
    dotMilestoneIndex = 0,
): void {
    if (isBleedDotMilestone(dotMilestoneIndex)) {
        tickBleedForRoundMilestone(units, eventBus, fx);
    }
}
