/**
 * Effects tied to the round progress bar cadence (0% and 50% of the round timer).
 *
 * Stamina surge and roundCharge recovery fire at round start; bleed ticks at both milestones.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';

export type RoundProgressMilestone = 'round_start' | 'round_half';

export interface RoundProgressMilestoneContext {
    units: Unit[];
    eventBus: EventBus;
    bleedFx?: BleedDamageFxContext;
}

/**
 * Single entry point for gameplay that should align with round timer thresholds.
 * Call from GameEngine when crossing 0% (round start) and 50% of the current round.
 * Round-start unit pulses (stamina surge, round charges) are handled by UnitManager.onRoundStart.
 */
export function onRoundProgressMilestone(milestone: RoundProgressMilestone, ctx: RoundProgressMilestoneContext): void {
    tickBleedForRoundMilestone(ctx.units, ctx.eventBus, ctx.bleedFx);
}
