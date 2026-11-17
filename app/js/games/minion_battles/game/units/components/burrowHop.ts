/**
 * `burrowHop` component: a rooted unit that never walks, and every few seconds digs under and comes up a short way
 * off. State, options and the pure rules; the per-tick work lives in `burrowHopHooks.ts`.
 *
 * Reusable engine piece: nothing here names the Garden Heart. The hop is the same burrow stage machine a phase's
 * `burrow` transition uses (`phaseBurrow.ts`: close -> sink -> travel -> rise, drawn by the same renderer), only the
 * trigger and the destination differ.
 *
 * ## Rules
 * - A hop is scheduled `intervalSeconds` (world time, rolled from the engine RNG between `min` and `max`) after the
 *   unit first ticks, and again after every hop lands.
 * - When the time comes the hop is DUE. A unit in the middle of a cast finishes it first; while a hop is due its AI
 *   should start no new cast (`isBurrowHopDue`), so the hop cannot be put off forever.
 * - The destination is a random open point `minDistancePx`-`maxDistancePx` away that keeps every Stem tether intact:
 *   within its parent's leash and within each tethered child's leash (`nodeTree`). Nothing valid: the unit stays and
 *   a fresh interval is rolled.
 * - The unit is untargetable (`UnitTag.Invincible`) and cannot act while it is under.
 */

import type { Unit } from '../Unit';
import type { BurrowTransitionDef } from './phaseDef';
import type { ActiveBurrow } from './phaseComponent';
import { parseActiveBurrow } from './phaseComponent';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export const BURROW_HOP_COMPONENT_ID = 'burrowHop';

export interface BurrowHopOptions {
    /** World seconds between hops, rolled each time (to the millisecond) between `min` and `max`. */
    intervalSeconds: { min: number; max: number };
    /** How far a hop may go (world px). */
    maxDistancePx: number;
    /** The shortest hop (world px). Default `maxDistancePx / 5`. */
    minDistancePx?: number;
    /** Stage lengths and optional callbacks / eruption. `sproutPoints` and the point rule are not used. */
    burrow: Omit<BurrowTransitionDef, 'sproutPoints' | 'pointRule' | 'exclusionZones' | 'exclusionSources' | 'minDistanceFromExclusions'>;
}

export interface BurrowHopState {
    /** World time (`engine.gameTime`) the next hop is due; null until scheduled. */
    nextHopAtGameTime: number | null;
    /** The hop in progress. */
    burrow: ActiveBurrow | null;
    /** The hop added `UnitTag.Invincible` (so only it removes the tag). */
    addedInvincibleTag: boolean;
}

export const BURROW_HOP_COMPONENT = defineUnitComponent<BurrowHopState, BurrowHopOptions>({
    id: BURROW_HOP_COMPONENT_ID,
    create: () => ({ nextHopAtGameTime: null, burrow: null, addedInvincibleTag: false }),
    toJSON: (s) => ({
        ...(s.nextHopAtGameTime !== null ? { hopNextAt: s.nextHopAtGameTime } : {}),
        ...(s.burrow ? { hopBurrow: { ...s.burrow } } : {}),
        ...(s.addedInvincibleTag ? { hopAddedInvincible: true } : {}),
    }),
    fromJSON: (s, data) => {
        s.nextHopAtGameTime = typeof data.hopNextAt === 'number' ? data.hopNextAt : null;
        s.burrow = parseActiveBurrow(data.hopBurrow);
        s.addedInvincibleTag = data.hopAddedInvincible === true;
    },
});

export function peekBurrowHopState(unit: Unit): BurrowHopState | undefined {
    return findComponentState(unit, BURROW_HOP_COMPONENT);
}

export function burrowHopOptionsOf(unit: Unit): BurrowHopOptions | undefined {
    return getComponentOptions(unit, BURROW_HOP_COMPONENT);
}

/** The burrow def a hop runs (the stage machine wants a full `BurrowTransitionDef`). */
export function burrowHopDef(options: BurrowHopOptions): BurrowTransitionDef {
    return { ...options.burrow, sproutPoints: [] };
}

/**
 * True when a hop is in progress, or its time has come (`gameTime` = the engine's world time): the unit's AI should
 * start no new cast. Without `gameTime` only a hop in progress counts.
 */
export function isBurrowHopDue(unit: Unit, gameTime?: number): boolean {
    const s = peekBurrowHopState(unit);
    if (!s) return false;
    if (s.burrow !== null) return true;
    return gameTime !== undefined && s.nextHopAtGameTime !== null && gameTime >= s.nextHopAtGameTime;
}
