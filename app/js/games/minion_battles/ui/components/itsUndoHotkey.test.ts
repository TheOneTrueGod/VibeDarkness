import { describe, expect, it } from 'vitest';
import {
    isEscapeItsUndoHotkey,
    isItsUndoDisabled,
    isKeyboardEventFromTextInput,
} from './itsUndoHotkey';

describe('isItsUndoDisabled', () => {
    it('is pressable when not rewinding and start-only gate is off', () => {
        expect(isItsUndoDisabled({
            isRewindCrossfade: false,
            onlyUndoAtStart: false,
            hasCollectedTargets: true,
        })).toBe(false);
    });

    it('disables during rewind crossfade', () => {
        expect(isItsUndoDisabled({
            isRewindCrossfade: true,
            onlyUndoAtStart: false,
            hasCollectedTargets: false,
        })).toBe(true);
    });

    it('disables after the first target when only-undo-at-start is on', () => {
        expect(isItsUndoDisabled({
            isRewindCrossfade: false,
            onlyUndoAtStart: true,
            hasCollectedTargets: true,
        })).toBe(true);
        expect(isItsUndoDisabled({
            isRewindCrossfade: false,
            onlyUndoAtStart: true,
            hasCollectedTargets: false,
        })).toBe(false);
    });
});

describe('isEscapeItsUndoHotkey', () => {
    it('matches a fresh Escape press', () => {
        expect(isEscapeItsUndoHotkey({ code: 'Escape', repeat: false })).toBe(true);
    });

    it('ignores key repeat and other keys', () => {
        expect(isEscapeItsUndoHotkey({ code: 'Escape', repeat: true })).toBe(false);
        expect(isEscapeItsUndoHotkey({ code: 'Space', repeat: false })).toBe(false);
    });
});

describe('isKeyboardEventFromTextInput', () => {
    it('is true for input / textarea / contenteditable', () => {
        expect(isKeyboardEventFromTextInput({ target: null })).toBe(false);
        expect(isKeyboardEventFromTextInput({ target: { tagName: 'INPUT' } as unknown as EventTarget })).toBe(true);
        expect(isKeyboardEventFromTextInput({ target: { tagName: 'TEXTAREA' } as unknown as EventTarget })).toBe(true);
        expect(isKeyboardEventFromTextInput({
            target: { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget,
        })).toBe(true);
        expect(isKeyboardEventFromTextInput({
            target: { tagName: 'DIV', isContentEditable: false } as unknown as EventTarget,
        })).toBe(false);
    });
});
