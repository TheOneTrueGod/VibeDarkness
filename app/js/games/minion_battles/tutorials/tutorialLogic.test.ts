import { describe, expect, it } from 'vitest';
import { readTutorialProgress } from '../../../accountKnowledge';
import {
    findTriggeredTutorial,
    formatTutorialStepText,
    nextButtonLabel,
    progressAfterStep,
    stepAdvancedBy,
    unitMatchesTutorialFilter,
} from './tutorialLogic';
import type { TutorialDef } from './tutorialTypes';

const MOVE_THEN_PUNCH: TutorialDef = {
    id: 'move_then_punch',
    knowledgeKey: 'TutorialTest',
    title: 'Test',
    trigger: { type: 'battleStart', missionId: 'm1' },
    steps: [
        { text: 'Move', advance: { type: 'localOrder', withMove: true } },
        { text: 'Punch', advance: { type: 'localOrder', abilityIds: ['0120'] } },
    ],
};

const READ_ONLY: TutorialDef = {
    id: 'read_only',
    knowledgeKey: 'TutorialTest',
    title: 'Read',
    trigger: { type: 'battleStart', missionId: 'm2', withinSeconds: 5 },
    steps: [{ text: 'A', advance: { type: 'next' } }, { text: 'B', advance: { type: 'next', label: 'Good luck' } }],
};

const ALL = [MOVE_THEN_PUNCH, READ_ONLY];
const atStart = (missionId: string) => ({ missionId, gameTimeSeconds: 0 });

describe('findTriggeredTutorial', () => {
    it('starts the matching tutorial at step 0 when the player has no progress', () => {
        expect(findTriggeredTutorial(ALL, {}, atStart('m1'))).toEqual({ def: MOVE_THEN_PUNCH, step: 0 });
        expect(findTriggeredTutorial(ALL, undefined, atStart('m2'))).toEqual({ def: READ_ONLY, step: 0 });
    });

    it('shows nothing in a mission without a tutorial', () => {
        expect(findTriggeredTutorial(ALL, {}, atStart('other'))).toBeNull();
    });

    it('resumes at the stored step and skips finished tutorials', () => {
        const midway = { TutorialTest: { tutorials: { move_then_punch: { step: 1, done: false } } } };
        expect(findTriggeredTutorial(ALL, midway, atStart('m1'))).toEqual({ def: MOVE_THEN_PUNCH, step: 1 });
        const finished = { TutorialTest: { tutorials: { move_then_punch: { step: 1, done: true } } } };
        expect(findTriggeredTutorial(ALL, finished, atStart('m1'))).toBeNull();
    });

    it('keeps separate progress for each tutorial on one knowledge key', () => {
        const knowledge = { TutorialTest: { tutorials: { move_then_punch: { step: 1, done: true } } } };
        expect(findTriggeredTutorial(ALL, knowledge, atStart('m2'))).toEqual({ def: READ_ONLY, step: 0 });
    });

    it('only fires a battle-start tutorial inside its time window', () => {
        expect(findTriggeredTutorial(ALL, {}, { missionId: 'm1', gameTimeSeconds: 3 })).toBeNull();
        expect(findTriggeredTutorial(ALL, {}, { missionId: 'm2', gameTimeSeconds: 3 })).not.toBeNull();
    });

    it('clamps a stored step past the end', () => {
        const knowledge = { TutorialTest: { tutorials: { read_only: { step: 9, done: false } } } };
        expect(findTriggeredTutorial(ALL, knowledge, atStart('m2'))?.step).toBe(1);
    });
});

describe('stepAdvancedBy', () => {
    const [move, punch] = MOVE_THEN_PUNCH.steps;

    it('a move step needs an order with a move', () => {
        expect(stepAdvancedBy(move, { type: 'localOrder', abilityId: 'wait', hasMove: true })).toBe(true);
        expect(stepAdvancedBy(move, { type: 'localOrder', abilityId: '0120', hasMove: false })).toBe(false);
    });

    it('an ability step needs one of its abilities', () => {
        expect(stepAdvancedBy(punch, { type: 'localOrder', abilityId: '0120', hasMove: false })).toBe(true);
        expect(stepAdvancedBy(punch, { type: 'localOrder', abilityId: 'wait', hasMove: true })).toBe(false);
    });

    it('button steps never advance from orders', () => {
        expect(stepAdvancedBy(READ_ONLY.steps[0], { type: 'localOrder', abilityId: 'wait', hasMove: true })).toBe(false);
    });
});

describe('progress', () => {
    it('moves to the next step, then is done after the last', () => {
        expect(progressAfterStep(MOVE_THEN_PUNCH, 0)).toEqual({ step: 1, done: false });
        expect(progressAfterStep(MOVE_THEN_PUNCH, 1)).toEqual({ step: 1, done: true });
    });

    it('labels button steps', () => {
        expect(nextButtonLabel(READ_ONLY, 0)).toBe('Next');
        expect(nextButtonLabel(READ_ONLY, 1)).toBe('Good luck');
        expect(nextButtonLabel(MOVE_THEN_PUNCH, 0)).toBeNull();
    });

    it('reads stored progress defensively', () => {
        expect(readTutorialProgress({ K: { acquiredAt: 1 } }, 'K', 't')).toBeNull();
        expect(readTutorialProgress({ K: { tutorials: { t: { step: -2, done: 'yes' } } } }, 'K', 't')).toEqual({
            step: 0,
            done: false,
        });
        expect(readTutorialProgress({ K: { tutorials: { t: { step: 2, done: true } } } }, 'K', 't')).toEqual({
            step: 2,
            done: true,
        });
    });
});

describe('unitOnScreen trigger', () => {
    const STACKS: TutorialDef = {
        id: 'stacks',
        knowledgeKey: 'TutorialTest',
        title: 'Stacks',
        trigger: { type: 'unitOnScreen', unit: { minStackSize: 2, hostile: true } },
        steps: [{ text: 'A stack of {stackSize}.', advance: { type: 'next' } }],
    };
    const lone = { characterId: 'wolf', stackSize: 1, hostile: true };
    const stack = { characterId: 'wolf', stackSize: 3, hostile: true };
    const alliedStack = { characterId: 'wolf', stackSize: 3, hostile: false };
    const ctx = (unitsOnScreen: typeof lone[]) => ({ missionId: 'any', gameTimeSeconds: 40, unitsOnScreen });

    it('fires in any mission, at any time, once a matching unit is on screen', () => {
        expect(findTriggeredTutorial([STACKS], {}, ctx([lone]))).toBeNull();
        expect(findTriggeredTutorial([STACKS], {}, ctx([alliedStack]))).toBeNull();
        expect(findTriggeredTutorial([STACKS], {}, ctx([lone, stack]))).toEqual({ def: STACKS, step: 0 });
    });

    it('skips excluded tutorials', () => {
        expect(findTriggeredTutorial([STACKS], {}, ctx([stack]), new Set(['stacks']))).toBeNull();
    });

    it('matches every field of a unit filter', () => {
        expect(unitMatchesTutorialFilter(stack, {})).toBe(true);
        expect(unitMatchesTutorialFilter(stack, { characterId: 'wolf', minStackSize: 3 })).toBe(true);
        expect(unitMatchesTutorialFilter(stack, { characterId: 'slime' })).toBe(false);
        expect(unitMatchesTutorialFilter(stack, { minStackSize: 4 })).toBe(false);
    });

    it('fills {stackSize} from the pointed unit', () => {
        expect(formatTutorialStepText('A stack of {stackSize}.', stack)).toBe('A stack of 3.');
        expect(formatTutorialStepText('A stack of {stackSize}.', null)).toBe('A stack of several.');
    });
});
