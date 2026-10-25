/**
 * `phase` component hooks. `tick` runs in the nest phase of the simulation tick (see `unitComponentHooks.ts`):
 * it ends expired transitions, then checks every phased unit's non-damage conditions (time, adds dead, counters).
 * HP conditions are also checked right after damage by `UnitManager`.
 */

import type { UnitComponentHooks } from './unitComponentHooks';
import { peekPhaseState } from './phaseComponent';
import { evaluateUnitPhases, tickPhaseTransition } from './phaseRuntime';

export const PHASE_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        // Snapshot: entering a phase may spawn units (onEnter), which must not join this pass mid-iteration.
        for (const unit of [...ctx.units]) {
            const state = peekPhaseState(unit);
            if (!state) continue;
            tickPhaseTransition(unit, state, ctx.engine);
            evaluateUnitPhases(unit, ctx.engine);
        }
    },
};
