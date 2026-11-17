/**
 * `burrowHop` component: a rooted unit that never walks, and every few ability casts digs under and comes up a short
 * way off. State, options and the pure rules; the per-tick work lives in `burrowHopHooks.ts`.
 *
 * Reusable engine piece: nothing here names the Garden Heart. The hop is the same burrow stage machine a phase's
 * `burrow` transition uses (`phaseBurrow.ts`: close -> sink -> travel -> rise, drawn by the same renderer), only the
 * trigger and the destination differ.
 *
 * ## Rules
 * - Casts are counted as they start. After `usesPerHop` casts (rolled from the engine RNG each time, `min`-`max`
 *   inclusive) a hop is DUE. While a hop is due the unit's AI should start no new cast (`isBurrowHopDue`), so the
 *   unit settles and hops instead of casting forever.
 * - The unit stays put while it casts and for `restSeconds` (world time) after its last cast ends. A due hop starts
 *   once that rest is over.
 * - The destination is a random open point `minDistancePx`-`maxDistancePx` away that keeps every Stem tether intact:
 *   within its parent's leash and within each tethered child's leash (`nodeTree`). Nothing valid: the count resets
 *   and the unit stays.
 * - The unit is untargetable (`UnitTag.Invincible`) and cannot act while it is under.
 *
 * Casts are counted from `ActiveAbility.startTime`, so a cast that starts and ends within one tick is not counted.
 */

import type { Unit } from '../Unit';
import type { BurrowTransitionDef } from './phaseDef';
import type { ActiveBurrow } from './phaseComponent';
import { parseActiveBurrow } from './phaseComponent';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export const BURROW_HOP_COMPONENT_ID = 'burrowHop';

export interface BurrowHopOptions {
    /** A hop is due after this many casts; rolled again after every hop. */
    usesPerHop: { min: number; max: number };
    /** World seconds the unit holds still after its last cast ends before a due hop starts. */
    restSeconds: number;
    /** How far a hop may go (world px). */
    maxDistancePx: number;
    /** The shortest hop (world px). Default `maxDistancePx / 5`. */
    minDistancePx?: number;
    /** Stage lengths and optional callbacks / eruption. `sproutPoints` and the point rule are not used. */
    burrow: Omit<BurrowTransitionDef, 'sproutPoints' | 'pointRule' | 'exclusionZones' | 'exclusionSources' | 'minDistanceFromExclusions'>;
}

export interface BurrowHopState {
    /** Casts counted since the last hop. */
    casts: number;
    /** Casts needed for the next hop; 0 until rolled. */
    castsNeeded: number;
    /** `startTime` (unit local time) of the newest cast counted; null before the first. */
    lastCountedCastStart: number | null;
    /** World time (`engine.gameTime`) before which the unit may not hop (casting, then the rest). */
    restUntilGameTime: number;
    /** The hop in progress. */
    burrow: ActiveBurrow | null;
    /** The hop added `UnitTag.Invincible` (so only it removes the tag). */
    addedInvincibleTag: boolean;
}

export const BURROW_HOP_COMPONENT = defineUnitComponent<BurrowHopState, BurrowHopOptions>({
    id: BURROW_HOP_COMPONENT_ID,
    create: () => ({
        casts: 0,
        castsNeeded: 0,
        lastCountedCastStart: null,
        restUntilGameTime: 0,
        burrow: null,
        addedInvincibleTag: false,
    }),
    toJSON: (s) => ({
        ...(s.casts > 0 ? { hopCasts: s.casts } : {}),
        ...(s.castsNeeded > 0 ? { hopCastsNeeded: s.castsNeeded } : {}),
        ...(s.lastCountedCastStart !== null ? { hopLastCastStart: s.lastCountedCastStart } : {}),
        ...(s.restUntilGameTime > 0 ? { hopRestUntil: s.restUntilGameTime } : {}),
        ...(s.burrow ? { hopBurrow: { ...s.burrow } } : {}),
        ...(s.addedInvincibleTag ? { hopAddedInvincible: true } : {}),
    }),
    fromJSON: (s, data) => {
        s.casts = typeof data.hopCasts === 'number' ? data.hopCasts : 0;
        s.castsNeeded = typeof data.hopCastsNeeded === 'number' ? data.hopCastsNeeded : 0;
        s.lastCountedCastStart = typeof data.hopLastCastStart === 'number' ? data.hopLastCastStart : null;
        s.restUntilGameTime = typeof data.hopRestUntil === 'number' ? data.hopRestUntil : 0;
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

/** True when the unit has cast enough for a hop and has not hopped yet: its AI should start no new cast. */
export function isBurrowHopDue(unit: Unit): boolean {
    const s = peekBurrowHopState(unit);
    return !!s && (s.burrow !== null || (s.castsNeeded > 0 && s.casts >= s.castsNeeded));
}
