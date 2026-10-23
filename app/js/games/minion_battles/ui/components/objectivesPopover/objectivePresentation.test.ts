import { describe, expect, it } from 'vitest';
import {
    diffObjectiveRows,
    initialObjectivesPopoverState,
    objectivesPopoverReducer,
    type ObjectivePresentationRow,
    type ObjectivesPopoverAction,
    type ObjectivesPopoverState,
} from './objectivePresentation';

const row = (id: string, completed = false): ObjectivePresentationRow => ({ id, label: id.toUpperCase(), completed });

function run(state: ObjectivesPopoverState, ...actions: ObjectivesPopoverAction[]): ObjectivesPopoverState {
    return actions.reduce(objectivesPopoverReducer, state);
}

const elapsed: ObjectivesPopoverAction = { type: 'phaseElapsed' };

function docked(rows: ObjectivePresentationRow[]): ObjectivesPopoverState {
    return run(initialObjectivesPopoverState, { type: 'showIntro', rows }, { type: 'start' }, elapsed);
}

describe('diffObjectiveRows', () => {
    it('detects completion', () => {
        expect(diffObjectiveRows([row('a')], [row('a', true)])).toEqual({
            newlyCompleted: ['a'],
            newlyRevealed: [],
            removed: [],
        });
    });

    it('detects reveal', () => {
        expect(diffObjectiveRows([row('a')], [row('a'), row('b')]).newlyRevealed).toEqual(['b']);
    });

    it('detects both', () => {
        const diff = diffObjectiveRows([row('a')], [row('a', true), row('b')]);
        expect(diff.newlyCompleted).toEqual(['a']);
        expect(diff.newlyRevealed).toEqual(['b']);
    });

    it('is empty when unchanged', () => {
        expect(diffObjectiveRows([row('a')], [row('a')])).toEqual({
            newlyCompleted: [],
            newlyRevealed: [],
            removed: [],
        });
    });
});

describe('objectivesPopoverReducer', () => {
    it('runs intro -> start -> docking -> docked', () => {
        let s = run(initialObjectivesPopoverState, { type: 'showIntro', rows: [row('a')] });
        expect(s.phase).toBe('intro');
        s = run(s, { type: 'start' });
        expect(s.phase).toBe('docking');
        s = run(s, elapsed);
        expect(s.phase).toBe('docked');
        expect(s.displayRows).toEqual([row('a')]);
    });

    it('skipIntro docks immediately so later changes still animate', () => {
        const next = [row('a', true), row('b')];
        let s = run(initialObjectivesPopoverState, { type: 'skipIntro', rows: [row('a')] });
        expect(s.phase).toBe('docked');
        s = run(s, { type: 'objectivesChanged', diff: diffObjectiveRows([row('a')], next), rows: next });
        expect(s.phase).toBe('expanding');
    });

    it('plays expanding -> checking -> sliding -> revealing -> docking on a change', () => {
        const next = [row('a', true), row('b')];
        let s = docked([row('a')]);
        s = run(s, { type: 'objectivesChanged', diff: diffObjectiveRows([row('a')], next), rows: next });
        expect(s.phase).toBe('expanding');
        expect(s.displayRows).toEqual([row('a')]);
        s = run(s, elapsed);
        expect(s.phase).toBe('checking');
        expect(s.displayRows).toEqual([row('a', true)]);
        s = run(s, elapsed);
        expect(s.phase).toBe('sliding');
        expect(s.displayRows).toEqual([row('a', true)]);
        s = run(s, elapsed);
        expect(s.phase).toBe('revealing');
        expect(s.displayRows).toEqual([row('b')]);
        s = run(s, elapsed);
        expect(s.phase).toBe('docking');
        expect(s.displayRows).toEqual([row('b')]);
        s = run(s, elapsed);
        expect(s.phase).toBe('docked');
        expect(s.displayRows).toEqual([row('b')]);
    });

    it('coalesces a change arriving mid-sequence into the next sequence', () => {
        const r1 = [row('a', true), row('b')];
        const r2 = [row('a', true), row('b', true), row('c')];
        let s = docked([row('a')]);
        s = run(s, { type: 'objectivesChanged', diff: diffObjectiveRows([row('a')], r1), rows: r1 });
        s = run(s, elapsed, { type: 'objectivesChanged', diff: diffObjectiveRows(r1, r2), rows: r2 });
        expect(s.pendingDiff?.newlyCompleted).toEqual(['b']);
        // finish first sequence: checking, sliding, revealing, then a second expanding instead of docking
        s = run(s, elapsed, elapsed, elapsed);
        expect(s.phase).toBe('expanding');
        expect(s.pendingDiff).toBeNull();
        expect(s.activeDiff?.newlyCompleted).toEqual(['b']);
        expect(s.activeDiff?.newlyRevealed).toEqual(['c']);
    });

    it('victory hides the objectives card at once (the victory popover plays the cross-off)', () => {
        let s = docked([row('a', true), row('b')]);
        s = run(s, { type: 'victory' });
        expect(s.phase).toBe('hidden');
        expect(s.displayRows).toEqual([]);
        expect(s.dismissedIds).toEqual(['a']);
    });

    it('victory mid-sequence drops the running sequence', () => {
        const next = [row('a', true), row('b')];
        let s = docked([row('a')]);
        s = run(s, { type: 'objectivesChanged', diff: diffObjectiveRows([row('a')], next), rows: next });
        expect(s.phase).toBe('expanding');
        s = run(s, { type: 'victory' });
        expect(s.phase).toBe('hidden');
        expect(s.activeDiff).toBeNull();
        expect(s.pendingDiff).toBeNull();
    });

    it('rebaseline while docked does not animate and drops rows that are already complete', () => {
        const next = [row('a', true), row('b')];
        const s = run(docked([row('a')]), { type: 'rebaseline', rows: next });
        expect(s.phase).toBe('docked');
        expect(s.displayRows).toEqual([row('b')]);
        expect(s.activeDiff).toBeNull();
    });
});
