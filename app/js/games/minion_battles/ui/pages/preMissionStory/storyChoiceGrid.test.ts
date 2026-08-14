import { describe, expect, it } from 'vitest';
import {
    STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT,
    STORY_CHOICE_GRID_SLOT_COUNT,
    STORY_CHOICE_SKIP_OPTION_ID,
    arrangeStoryChoiceGridSlots,
    isStoryChoiceSkipOption,
} from './storyChoiceGrid';
import type { StoryChoiceOptionRow } from '../../../storylines/storyTypes';

function row(id: string, label: string): StoryChoiceOptionRow {
    return {
        id,
        label,
        action: { type: 'grant_resources' },
    };
}

describe('isStoryChoiceSkipOption', () => {
    it('matches skip id and common skip labels', () => {
        expect(isStoryChoiceSkipOption(row(STORY_CHOICE_SKIP_OPTION_ID, 'Anything'))).toBe(true);
        expect(isStoryChoiceSkipOption(row('x', 'Leave nothing but footprints'))).toBe(true);
        expect(isStoryChoiceSkipOption(row('x', 'Do Nothing'))).toBe(true);
        expect(isStoryChoiceSkipOption(row('x', 'Cancel'))).toBe(true);
    });

    it('does not treat regular options as skip', () => {
        expect(isStoryChoiceSkipOption(row('eat_berries', 'Eat the Berries'))).toBe(false);
    });
});

describe('arrangeStoryChoiceGridSlots', () => {
    it('places synthetic skip in the bottom-right cell', () => {
        const slots = arrangeStoryChoiceGridSlots(
            [row('a', 'A'), row('b', 'B')],
            row(STORY_CHOICE_SKIP_OPTION_ID, 'Leave nothing but footprints'),
        );
        expect(slots[0]?.id).toBe('a');
        expect(slots[1]?.id).toBe('b');
        expect(slots[STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT]?.id).toBe(STORY_CHOICE_SKIP_OPTION_ID);
    });

    it('pulls skip options out of the regular list into bottom-right', () => {
        const slots = arrangeStoryChoiceGridSlots([
            row('a', 'A'),
            row(STORY_CHOICE_SKIP_OPTION_ID, 'Leave nothing but footprints'),
            row('b', 'B'),
        ]);
        expect(slots.filter(Boolean).map((s) => s!.id)).toEqual(['a', 'b', STORY_CHOICE_SKIP_OPTION_ID]);
        expect(slots[STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT]?.id).toBe(STORY_CHOICE_SKIP_OPTION_ID);
    });

    it('fills up to nine regular cells when no skip is present', () => {
        const options = Array.from({ length: STORY_CHOICE_GRID_SLOT_COUNT }, (_, i) =>
            row(`opt_${i}`, `Option ${i}`),
        );
        const slots = arrangeStoryChoiceGridSlots(options);
        expect(slots.every(Boolean)).toBe(true);
        expect(slots.map((s) => s!.id)).toEqual(options.map((o) => o.id));
    });
});
