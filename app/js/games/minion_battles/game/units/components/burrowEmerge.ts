/**
 * `burrowEmerge` component: a unit that ARRIVES by burrowing. It starts underground at some point (e.g. its parent),
 * optionally waits, travels to where it was spawned and rises there, with a puff of rock chips. State and the pure def
 * only; starting one and the per-tick work live in `burrowEmergeHooks.ts` (`startBurrowEmerge`).
 *
 * Reusable engine piece: nothing here names the Garden Heart. It is attached on first use (any unit can emerge, with
 * or without a def-declared `burrowHop`) and runs the same burrow stage machine as phases and hops (`phaseBurrow.ts`,
 * drawn by the same renderer). The unit is untargetable (`UnitTag.Invincible`) and cannot act until it has risen.
 *
 * The same component also carries a unit on a whole burrow to a point (`startBurrowMove`: close, sink, travel, rise),
 * e.g. a node that moves with its tree's root. Either way it is one burrow at a time.
 */

import type { Unit } from '../Unit';
import type { BurrowTransitionDef, BurrowEruptionDef } from './phaseDef';
import type { ActiveBurrow } from './phaseComponent';
import { parseActiveBurrow } from './phaseComponent';
import { defineUnitComponent, findComponentState } from './unitComponent';

export const BURROW_EMERGE_COMPONENT_ID = 'burrowEmerge';

/** The surfacing: a harmless puff (no damage, so no blast circle) with a few rock chips. */
export const BURROW_EMERGE_ERUPTION: BurrowEruptionDef = {
    radiusUnitRadii: 2,
    damage: 0,
    reactable: false,
    rockShower: { count: 6 },
};

export interface BurrowEmergeState {
    /** The emergence in progress, or null. */
    burrow: ActiveBurrow | null;
    /** Stage lengths of the burrow in progress (tick-time seconds). Close and sink are 0 for an emergence. */
    closeSeconds: number;
    sinkSeconds: number;
    travelSeconds: number;
    riseSeconds: number;
    /** The emergence added `UnitTag.Invincible` (so only it removes the tag). */
    addedInvincibleTag: boolean;
}

export const BURROW_EMERGE_COMPONENT = defineUnitComponent<BurrowEmergeState>({
    id: BURROW_EMERGE_COMPONENT_ID,
    create: () => ({ burrow: null, closeSeconds: 0, sinkSeconds: 0, travelSeconds: 0, riseSeconds: 0, addedInvincibleTag: false }),
    toJSON: (s) =>
        s.burrow
            ? {
                  emergeBurrow: { ...s.burrow },
                  ...(s.closeSeconds ? { emergeCloseSeconds: s.closeSeconds } : {}),
                  ...(s.sinkSeconds ? { emergeSinkSeconds: s.sinkSeconds } : {}),
                  emergeTravelSeconds: s.travelSeconds,
                  emergeRiseSeconds: s.riseSeconds,
                  ...(s.addedInvincibleTag ? { emergeAddedInvincible: true } : {}),
              }
            : {},
    fromJSON: (s, data) => {
        s.burrow = parseActiveBurrow(data.emergeBurrow);
        s.closeSeconds = typeof data.emergeCloseSeconds === 'number' ? data.emergeCloseSeconds : 0;
        s.sinkSeconds = typeof data.emergeSinkSeconds === 'number' ? data.emergeSinkSeconds : 0;
        s.travelSeconds = typeof data.emergeTravelSeconds === 'number' ? data.emergeTravelSeconds : 0;
        s.riseSeconds = typeof data.emergeRiseSeconds === 'number' ? data.emergeRiseSeconds : 0;
        s.addedInvincibleTag = data.emergeAddedInvincible === true;
    },
});

export function peekBurrowEmergeState(unit: Unit): BurrowEmergeState | undefined {
    return findComponentState(unit, BURROW_EMERGE_COMPONENT);
}

/** The burrow def the burrow in progress runs (an emergence has no close or sink). */
export function burrowEmergeDef(
    state: Pick<BurrowEmergeState, 'travelSeconds' | 'riseSeconds'> & Partial<Pick<BurrowEmergeState, 'closeSeconds' | 'sinkSeconds'>>,
): BurrowTransitionDef {
    return {
        closeSeconds: state.closeSeconds ?? 0,
        sinkSeconds: state.sinkSeconds ?? 0,
        travelSeconds: state.travelSeconds,
        riseSeconds: state.riseSeconds,
        sproutPoints: [],
        eruption: BURROW_EMERGE_ERUPTION,
    };
}
