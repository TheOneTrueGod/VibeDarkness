/**
 * Effects tied to the round progress bar cadence (0% and 50% of the round timer).
 *
 * Stamina recovery fires at round start; bleed ticks at both milestones.
 */

import type { Unit } from './units/Unit';
import type { EventBus } from './EventBus';
import { tickBleedForRoundMilestone, type BleedDamageFxContext } from '../buffs/bleedRuntime';

export type RoundProgressMilestone = 'round_start' | 'round_half';

export interface RoundProgressMilestoneContext {
    units: Unit[];
    eventBus: EventBus;
    applyStaminaPulse: () => void;
    bleedFx?: BleedDamageFxContext;
}

/**
 * Single entry point for gameplay that should align with round timer thresholds.
 * Call from GameEngine when crossing 0% (round start) and 50% of the current round.
 */
export function onRoundProgressMilestone(milestone: RoundProgressMilestone, ctx: RoundProgressMilestoneContext): void {
    if (milestone === 'round_start') {
        ctx.applyStaminaPulse();
    }
    tickBleedForRoundMilestone(ctx.units, ctx.eventBus, ctx.bleedFx);
}
