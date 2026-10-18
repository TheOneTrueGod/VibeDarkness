/**
 * Step pieces — how one actor's (possibly long) step is cut into sub-intervals. See `./AGENTS.md`.
 *
 * A step of at most `FIXED_DT` is ONE piece (exactly today's single call; slowed actors simply take a smaller
 * dt). A longer step (a hasted actor, or leftover `timeDebt`) is cut at
 *  1. next-event boundaries (ability interval starts/ends inside the window), and
 *  2. a max travel distance per piece (`maxTravelPx`, for movement/knockback at `speedPx`).
 * At most `budget` pieces run per tick; whatever local time is left over is returned as `debt` and carried to
 * the next tick by the caller (`unit.timeDebt`). Pure and deterministic.
 */
import { FIXED_DT } from '../gameConstants';
import { MAX_PIECE_TRAVEL_PX, MAX_STEP_PIECES_PER_TICK } from './timeConstants';

export interface PlanStepPiecesInput {
    /** Local seconds to run this tick, debt included. */
    stepDt: number;
    /**
     * Offsets (local seconds from the start of the step) of event boundaries, e.g. ability interval starts/ends.
     * A single number (the next one) is accepted. Offsets outside `(0, stepDt)` are ignored.
     */
    nextEventIn?: number | readonly number[];
    /** Max distance a piece may travel. Defaults to `MAX_PIECE_TRAVEL_PX`. */
    maxTravelPx?: number;
    /** Fastest speed (px per local second) the actor moves at during the step; 0 or absent = does not travel. */
    speedPx?: number;
    /** Max pieces to run this tick. Defaults to `MAX_STEP_PIECES_PER_TICK`. */
    budget?: number;
}

export interface StepPiecePlan {
    /** dt of each piece, in order. Their sum plus `debt` equals `stepDt`. */
    pieces: number[];
    /** Local seconds not run this tick (budget exhausted); carry as `timeDebt`. 0 when everything fits. */
    debt: number;
}

const BOUNDARY_EPSILON = 1e-9;
/** A step this close to FIXED_DT counts as one normal tick (float noise from `pace x tempo` products). */
const SINGLE_PIECE_TOLERANCE = 1 + 1e-9;

/** True when a step needs no splitting: the common path, identical to today's single call. */
export function isSinglePieceStep(stepDt: number): boolean {
    return stepDt <= FIXED_DT * SINGLE_PIECE_TOLERANCE;
}

export function planStepPieces(input: PlanStepPiecesInput): StepPiecePlan {
    const { stepDt } = input;
    if (!(stepDt > 0)) return { pieces: [], debt: 0 };
    if (isSinglePieceStep(stepDt)) return { pieces: [stepDt], debt: 0 };

    const budget = Math.max(1, Math.floor(input.budget ?? MAX_STEP_PIECES_PER_TICK));
    const maxTravelPx = input.maxTravelPx ?? MAX_PIECE_TRAVEL_PX;
    const speedPx = input.speedPx ?? 0;

    // Cut points: 0, each distinct event boundary strictly inside the step, stepDt.
    const raw = input.nextEventIn === undefined ? [] : typeof input.nextEventIn === 'number' ? [input.nextEventIn] : input.nextEventIn;
    const cuts: number[] = [0];
    for (const b of [...raw].sort((a, c) => a - c)) {
        if (b > cuts[cuts.length - 1]! + BOUNDARY_EPSILON && b < stepDt - BOUNDARY_EPSILON) cuts.push(b);
    }
    cuts.push(stepDt);

    // Each segment is split into equal pieces no longer than the travel cap.
    const pieces: number[] = [];
    let consumed = 0;
    outer: for (let s = 0; s + 1 < cuts.length; s++) {
        const start = cuts[s]!;
        const end = cuts[s + 1]!;
        const len = end - start;
        const n = speedPx > 0 && maxTravelPx > 0 ? Math.max(1, Math.ceil((len * speedPx) / maxTravelPx - 1e-9)) : 1;
        let prev = start;
        for (let i = 1; i <= n; i++) {
            if (pieces.length >= budget) break outer;
            const pieceEnd = i === n ? end : start + (len * i) / n;
            const dt = pieceEnd - prev;
            pieces.push(dt);
            consumed += dt;
            prev = pieceEnd;
        }
    }

    const complete = consumed >= stepDt - BOUNDARY_EPSILON;
    return { pieces, debt: complete ? 0 : Math.max(0, stepDt - consumed) };
}
