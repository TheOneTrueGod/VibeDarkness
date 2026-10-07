/**
 * displacerKite — shared "playful hover" positioning for the Displacer Spirit and its clones.
 *
 * The unit keeps ~70% of the bolt's range from the nearest player, drifting around them in short
 * move segments separated by brief pauses (spirit-like stops and starts). The decision core
 * (`advanceKite`) is pure so it can be unit tested; `applyKiteMovement` wires it to AI navigation.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import { distance } from '../utils';
import {
    DISPLACER_KITE_MOVE_SEC,
    DISPLACER_KITE_ORBIT_RADIANS,
    DISPLACER_KITE_PAUSE_SEC,
    DISPLACER_KITE_RANGE_FRACTION,
    DISPLACER_KITE_TOLERANCE,
} from '../../../displacer/displacerConstants';
import { DISPLACER_BOLT_TARGET_RANGE } from '../../../../card_defs/dark_animals/0017_DisplacerBolt/0017Ability';

/** Distance (px) the displacer family tries to hold from the nearest player. */
export const DISPLACER_KITE_DISTANCE = DISPLACER_BOLT_TARGET_RANGE * DISPLACER_KITE_RANGE_FRACTION;

export type KiteMode = 'move' | 'pause';

/** Serializable kite state stored on the unit's AI context. */
export interface KiteState {
    kiteMode?: KiteMode;
    /** Game time (s) at which the current move/pause segment ends. */
    kiteUntil?: number;
    /** Angular drift (radians) of the current move segment's destination around the target. */
    kiteOrbit?: number;
}

export interface KiteDecision {
    mode: KiteMode;
    /** True when a new move segment just began (caller should pick a fresh destination). */
    startedMove: boolean;
    /** True when a pause just began (caller should stop walking). */
    startedPause: boolean;
}

function randomBetween(range: { min: number; max: number }, randomInt: (min: number, max: number) => number): number {
    return range.min + (randomInt(0, 1000) / 1000) * (range.max - range.min);
}

/**
 * Advance the move/pause state machine. Mutates `state`.
 * - Starts in a move segment.
 * - When a segment's time is up it flips (move -> pause -> move ...).
 * - A pause is cut short (back to moving) when spacing drifts more than the tolerance from ideal.
 */
export function advanceKite(
    state: KiteState,
    now: number,
    currentDistance: number,
    idealDistance: number,
    randomInt: (min: number, max: number) => number,
): KiteDecision {
    const beginMove = (): KiteDecision => {
        state.kiteMode = 'move';
        state.kiteUntil = now + randomBetween(DISPLACER_KITE_MOVE_SEC, randomInt);
        state.kiteOrbit = (randomInt(-1000, 1000) / 1000) * DISPLACER_KITE_ORBIT_RADIANS;
        return { mode: 'move', startedMove: true, startedPause: false };
    };
    const beginPause = (): KiteDecision => {
        state.kiteMode = 'pause';
        state.kiteUntil = now + randomBetween(DISPLACER_KITE_PAUSE_SEC, randomInt);
        return { mode: 'pause', startedMove: false, startedPause: true };
    };

    if (state.kiteMode === undefined || state.kiteUntil === undefined) return beginMove();

    const offRange = Math.abs(currentDistance - idealDistance) > DISPLACER_KITE_TOLERANCE;
    if (state.kiteMode === 'pause') {
        if (offRange || now >= state.kiteUntil) return beginMove();
        return { mode: 'pause', startedMove: false, startedPause: false };
    }
    if (now >= state.kiteUntil) return beginPause();
    return { mode: 'move', startedMove: false, startedPause: false };
}

/** Walk to a point on the kite ring around `target`, drifted by the current `kiteOrbit`. */
function walkToKiteDestination(unit: Unit, target: Unit, context: AIContext, state: KiteState): void {
    const baseAngle = Math.atan2(unit.y - target.y, unit.x - target.x);
    const angle = baseAngle + (state.kiteOrbit ?? 0);
    const destX = Math.max(0, Math.min(context.WORLD_WIDTH, target.x + Math.cos(angle) * DISPLACER_KITE_DISTANCE));
    const destY = Math.max(0, Math.min(context.WORLD_HEIGHT, target.y + Math.sin(angle) * DISPLACER_KITE_DISTANCE));
    context.nav.moveToPoint(unit, destX, destY);
}

/**
 * Run one AI turn of kiting around `target`.
 *
 * `continuous` (the boss): never pauses. It keeps flitting from one ring point to the next and
 * re-issues a destination whenever it is not walking (e.g. after an ability cast), so it only
 * stands still while it is activating an ability. Clones use the default stop/start form.
 */
export function applyKiteMovement(
    unit: Unit,
    target: Unit,
    context: AIContext,
    opts?: { continuous?: boolean },
): void {
    const state = unit.aiContext as KiteState;
    const randomInt = (min: number, max: number) => context.generateRandomInteger(min, max);

    if (opts?.continuous) {
        const now = context.gameTime;
        const segmentOver = state.kiteUntil === undefined || now >= state.kiteUntil;
        if (!segmentOver && context.nav.isWalking(unit)) return;
        state.kiteMode = 'move';
        state.kiteUntil = now + randomBetween(DISPLACER_KITE_MOVE_SEC, randomInt);
        state.kiteOrbit = (randomInt(-1000, 1000) / 1000) * DISPLACER_KITE_ORBIT_RADIANS;
        walkToKiteDestination(unit, target, context, state);
        return;
    }

    const dist = distance(unit.x, unit.y, target.x, target.y);
    const decision = advanceKite(state, context.gameTime, dist, DISPLACER_KITE_DISTANCE, randomInt);

    if (decision.startedPause) {
        context.nav.stop(unit);
        return;
    }
    if (!decision.startedMove) return;
    walkToKiteDestination(unit, target, context, state);
}
