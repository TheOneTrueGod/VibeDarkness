import { describe, it, expect } from 'vitest';
import { planStepPieces, isSinglePieceStep } from './stepPieces';
import { FIXED_DT } from '../gameConstants';
import { MAX_PIECE_TRAVEL_PX, MAX_STEP_PIECES_PER_TICK } from './timeConstants';

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe('planStepPieces', () => {
    it('is one piece of exactly stepDt for steps up to FIXED_DT', () => {
        expect(planStepPieces({ stepDt: FIXED_DT })).toEqual({ pieces: [FIXED_DT], debt: 0 });
        expect(planStepPieces({ stepDt: FIXED_DT / 2, speedPx: 9999, nextEventIn: [FIXED_DT / 4] })).toEqual({
            pieces: [FIXED_DT / 2],
            debt: 0,
        });
        expect(isSinglePieceStep(FIXED_DT)).toBe(true);
    });

    it('returns no pieces for a zero step', () => {
        expect(planStepPieces({ stepDt: 0 })).toEqual({ pieces: [], debt: 0 });
    });

    it('a still actor costs one piece however long the step is', () => {
        const plan = planStepPieces({ stepDt: FIXED_DT * 100, speedPx: 0 });
        expect(plan.pieces).toEqual([FIXED_DT * 100]);
        expect(plan.debt).toBe(0);
    });

    it('cuts a 3.1415x step by travel distance, deterministically', () => {
        const stepDt = FIXED_DT * 3.1415;
        const speedPx = 300;
        const a = planStepPieces({ stepDt, speedPx });
        const b = planStepPieces({ stepDt, speedPx });
        expect(a).toEqual(b);
        expect(a.debt).toBe(0);
        expect(sum(a.pieces)).toBeCloseTo(stepDt, 12);
        for (const p of a.pieces) expect(p * speedPx).toBeLessThanOrEqual(MAX_PIECE_TRAVEL_PX + 1e-6);
        expect(a.pieces.length).toBe(Math.ceil((stepDt * speedPx) / MAX_PIECE_TRAVEL_PX));
    });

    it('cuts a 100x walking step into travel-capped pieces', () => {
        const stepDt = FIXED_DT * 100;
        const plan = planStepPieces({ stepDt, speedPx: 200 });
        for (const p of plan.pieces) expect(p * 200).toBeLessThanOrEqual(MAX_PIECE_TRAVEL_PX + 1e-6);
        expect(plan.pieces.length).toBeLessThanOrEqual(MAX_STEP_PIECES_PER_TICK);
        expect(sum(plan.pieces) + plan.debt).toBeCloseTo(stepDt, 12);
    });

    it('cuts at event boundaries', () => {
        const stepDt = FIXED_DT * 2;
        const plan = planStepPieces({ stepDt, nextEventIn: [FIXED_DT * 0.5, FIXED_DT * 1.5, stepDt, 0, -1] });
        expect(plan.pieces).toHaveLength(3);
        expect(plan.pieces[0]).toBeCloseTo(FIXED_DT * 0.5, 12);
        expect(plan.pieces[1]).toBeCloseTo(FIXED_DT, 12);
        expect(plan.pieces[2]).toBeCloseTo(FIXED_DT * 0.5, 12);
        expect(plan.debt).toBe(0);
        expect(planStepPieces({ stepDt, nextEventIn: FIXED_DT }).pieces).toHaveLength(2);
    });

    it('carries leftover time as debt when the budget is exhausted', () => {
        const stepDt = FIXED_DT * 1000;
        const plan = planStepPieces({ stepDt, speedPx: 200, budget: 8 });
        expect(plan.pieces).toHaveLength(8);
        expect(plan.debt).toBeGreaterThan(0);
        expect(sum(plan.pieces) + plan.debt).toBeCloseTo(stepDt, 12);
    });

    it('defaults the budget to MAX_STEP_PIECES_PER_TICK', () => {
        const plan = planStepPieces({ stepDt: FIXED_DT * 100000, speedPx: 5000 });
        expect(plan.pieces).toHaveLength(MAX_STEP_PIECES_PER_TICK);
        expect(plan.debt).toBeGreaterThan(0);
    });
});
