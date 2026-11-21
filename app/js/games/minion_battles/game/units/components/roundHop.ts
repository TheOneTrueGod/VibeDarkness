/**
 * `roundHop` component: a unit that burrows to a new spot once per round, at the same moment of every round. State,
 * options and the pure schedule; the per-tick work and the destination-rule registry live in `roundHopHooks.ts`.
 *
 * Reusable engine piece: nothing here names the Garden Heart. It is the same burrow stage machine phases, hops and
 * emergences use (`phaseBurrow.ts`, drawn by the same renderer); only the trigger and the destination differ.
 *
 * ## Rules
 * - The first time the unit ticks it rolls its moment, `window.min`-`window.max` seconds into a round (world time,
 *   engine RNG, to the millisecond), and keeps it for the whole fight. Every round it burrows at that moment.
 * - A unit in the middle of a cast, held by something else (stun, a phase's burrow) or already burrowing waits, then
 *   goes as soon as it is free. After it lands, the next move is at the moment of the following round.
 * - A registered destination rule (`registerRoundHopDestinationRule`) picks where it goes. No answer: it stays.
 * - `carryNodeTree`: everything under the unit in its node tree burrows the same way by the same offset, at the same
 *   time, so Stems keep their length (`burrowEmerge`'s `startBurrowMove`). Nodes already burrowing stay put.
 * - The unit is untargetable (`UnitTag.Invincible`) and cannot act while it is under. A phase's burrow overrides it.
 */

import type { Unit } from '../Unit';
import type { BurrowTransitionDef } from './phaseDef';
import type { ActiveBurrow } from './phaseComponent';
import { parseActiveBurrow } from './phaseComponent';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

export const ROUND_HOP_COMPONENT_ID = 'roundHop';

export interface RoundHopOptions {
    /** When in the round it moves: a moment rolled once between these (world seconds from the round's start). */
    window: { min: number; max: number };
    /** Registered destination rule id (`registerRoundHopDestinationRule`). */
    destinationRule: string;
    /** Stage lengths and optional eruption. Sprout points, point rules and exclusions are not used. */
    burrow: Omit<BurrowTransitionDef, 'sproutPoints' | 'pointRule' | 'exclusionZones' | 'exclusionSources' | 'minDistanceFromExclusions'>;
    /** Move everything under the unit in its node tree with it. Default false. */
    carryNodeTree?: boolean;
}

export interface RoundHopState {
    /** Seconds into every round the unit moves; null until rolled (on its first tick). */
    offsetSeconds: number | null;
    /** World time the next move is due; null until scheduled. */
    nextAtGameTime: number | null;
    /** The move in progress. */
    burrow: ActiveBurrow | null;
    /** The move added `UnitTag.Invincible` (so only it removes the tag). */
    addedInvincibleTag: boolean;
}

export const ROUND_HOP_COMPONENT = defineUnitComponent<RoundHopState, RoundHopOptions>({
    id: ROUND_HOP_COMPONENT_ID,
    create: () => ({ offsetSeconds: null, nextAtGameTime: null, burrow: null, addedInvincibleTag: false }),
    toJSON: (s) => ({
        ...(s.offsetSeconds !== null ? { roundHopOffset: s.offsetSeconds } : {}),
        ...(s.nextAtGameTime !== null ? { roundHopNextAt: s.nextAtGameTime } : {}),
        ...(s.burrow ? { roundHopBurrow: { ...s.burrow } } : {}),
        ...(s.addedInvincibleTag ? { roundHopAddedInvincible: true } : {}),
    }),
    fromJSON: (s, data) => {
        s.offsetSeconds = typeof data.roundHopOffset === 'number' ? data.roundHopOffset : null;
        s.nextAtGameTime = typeof data.roundHopNextAt === 'number' ? data.roundHopNextAt : null;
        s.burrow = parseActiveBurrow(data.roundHopBurrow);
        s.addedInvincibleTag = data.roundHopAddedInvincible === true;
    },
});

export function peekRoundHopState(unit: Unit): RoundHopState | undefined {
    return findComponentState(unit, ROUND_HOP_COMPONENT);
}

export function roundHopOptionsOf(unit: Unit): RoundHopOptions | undefined {
    return getComponentOptions(unit, ROUND_HOP_COMPONENT);
}

/** The burrow def a move runs (the stage machine wants a full `BurrowTransitionDef`). */
export function roundHopDef(options: RoundHopOptions): BurrowTransitionDef {
    return { ...options.burrow, sproutPoints: [] };
}

/** The first moment `offsetSeconds` into a round that is strictly after `gameTime` (rounds are `roundSeconds` long). */
export function nextRoundMoment(gameTime: number, offsetSeconds: number, roundSeconds: number): number {
    const round = Math.floor(gameTime / roundSeconds + 1e-9);
    const thisRound = round * roundSeconds + offsetSeconds;
    return thisRound > gameTime ? thisRound : thisRound + roundSeconds;
}
