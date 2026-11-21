/**
 * `burrowEmerge` hooks (state in `burrowEmerge.ts`): `startBurrowEmerge` puts a unit underground and sends it to where
 * it stands; `startBurrowMove` sends a unit on a whole burrow to a point; `tick` drives every one in progress and hands
 * the unit back when it has risen.
 */

import type { EngineContext } from '../../EngineContext';
import type { Unit } from '../Unit';
import type { UnitComponentHooks } from './unitComponentHooks';
import {
    BURROW_EMERGE_COMPONENT,
    BURROW_EMERGE_COMPONENT_ID,
    burrowEmergeDef,
    peekBurrowEmergeState,
    type BurrowEmergeState,
} from './burrowEmerge';
import { advanceBurrow, beginBurrow, beginBurrowUnderground } from './phaseBurrow';
import { getComponentState } from './unitComponent';
import { UnitTag, addUnitTag, hasUnitTag, removeUnitTag } from '../unitTag';

export interface BurrowEmergeRequest {
    /** Where it goes under (it travels from here to where the unit stands now). */
    from: { x: number; y: number };
    /** Tick-time seconds it waits underground at `from` before it sets off. Default 0. */
    delaySeconds?: number;
    travelSeconds: number;
    riseSeconds: number;
}

function finishEmerge(unit: Unit, state: BurrowEmergeState): void {
    if (state.addedInvincibleTag) removeUnitTag(unit, UnitTag.Invincible);
    state.addedInvincibleTag = false;
}

/**
 * Make `unit` arrive by burrowing: it is moved underground to `request.from` now, waits, then travels back to the spot
 * it stood on and rises. Untargetable and unable to act until it has risen.
 */
export function startBurrowEmerge(unit: Unit, engine: EngineContext, request: BurrowEmergeRequest): void {
    const state = getComponentState(unit, BURROW_EMERGE_COMPONENT);
    state.closeSeconds = 0;
    state.sinkSeconds = 0;
    state.travelSeconds = Math.max(0, request.travelSeconds);
    state.riseSeconds = Math.max(0, request.riseSeconds);
    if (!hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        state.addedInvincibleTag = true;
    }
    const to = { x: unit.x, y: unit.y };
    beginBurrowUnderground(
        unit,
        state,
        BURROW_EMERGE_COMPONENT_ID,
        burrowEmergeDef(state),
        request.from,
        to,
        engine,
        request.delaySeconds ?? 0,
    );
    if (!state.burrow) finishEmerge(unit, state); // zero-length emergence
}

export interface BurrowMoveRequest {
    /** Where it comes up. */
    to: { x: number; y: number };
    closeSeconds: number;
    sinkSeconds: number;
    travelSeconds: number;
    riseSeconds: number;
}

/**
 * Send `unit` on a whole burrow (close, sink, travel, rise) from where it stands to `request.to`, with a harmless puff
 * where it comes up. Untargetable and unable to act until it has risen. Any cast in progress is interrupted.
 */
export function startBurrowMove(unit: Unit, engine: EngineContext, request: BurrowMoveRequest): void {
    const state = getComponentState(unit, BURROW_EMERGE_COMPONENT);
    state.closeSeconds = Math.max(0, request.closeSeconds);
    state.sinkSeconds = Math.max(0, request.sinkSeconds);
    state.travelSeconds = Math.max(0, request.travelSeconds);
    state.riseSeconds = Math.max(0, request.riseSeconds);
    if (!hasUnitTag(unit, UnitTag.Invincible)) {
        addUnitTag(unit, UnitTag.Invincible);
        state.addedInvincibleTag = true;
    }
    beginBurrow(unit, state, BURROW_EMERGE_COMPONENT_ID, burrowEmergeDef(state), request.to, engine);
    if (!state.burrow) finishEmerge(unit, state); // zero-length move
}

/** True while the unit is emerging (underground or rising). */
export function isBurrowEmerging(unit: Unit): boolean {
    return peekBurrowEmergeState(unit)?.burrow != null;
}

export const BURROW_EMERGE_HOOKS: UnitComponentHooks = {
    tick(ctx) {
        for (const unit of [...ctx.units]) {
            const state = peekBurrowEmergeState(unit);
            if (!state?.burrow || !unit.isAlive()) continue;
            advanceBurrow(unit, state, burrowEmergeDef(state), ctx.engine);
            if (!state.burrow) finishEmerge(unit, state);
        }
    },
};
