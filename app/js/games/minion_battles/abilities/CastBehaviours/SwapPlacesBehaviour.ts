/**
 * SwapPlaces: on the window's first tick the caster and a partner unit trade positions instantly
 * (a boss trading places with one of its crystals, a decoy swap). Both lose any movement in progress.
 * `partner` picks the unit (null = no swap, e.g. none left); `onSwap` runs after the move with both
 * old positions, for puffs or follow-up effects. Deterministic: the partner pick must use world state
 * or the engine RNG only.
 */

import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { Unit } from '../../game/units/Unit';

type Point = { x: number; y: number };

export interface SwapPlacesConfig {
    partner: (ctx: CastBehaviourTickContext) => Unit | null;
    onSwap?: (ctx: CastBehaviourTickContext, partner: Unit, casterFrom: Point, partnerFrom: Point) => void;
}

/** Trade two units' positions, cancelling any movement in progress. */
export function swapUnitPositions(a: Unit, b: Unit): void {
    const ax = a.x;
    const ay = a.y;
    a.clearMovement();
    b.clearMovement();
    a.x = b.x;
    a.y = b.y;
    b.x = ax;
    b.y = ay;
}

export class SwapPlacesBehaviour implements CastBehaviour {
    constructor(private readonly config: SwapPlacesConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isFirstTick) return;
        const partner = this.config.partner(ctx);
        if (!partner || partner === ctx.caster || !partner.isAlive()) return;
        const casterFrom = { x: ctx.caster.x, y: ctx.caster.y };
        const partnerFrom = { x: partner.x, y: partner.y };
        swapUnitPositions(ctx.caster, partner);
        this.config.onSwap?.(ctx, partner, casterFrom, partnerFrom);
    }
}

export function SwapPlaces(config: SwapPlacesConfig): SwapPlacesBehaviour {
    return new SwapPlacesBehaviour(config);
}
