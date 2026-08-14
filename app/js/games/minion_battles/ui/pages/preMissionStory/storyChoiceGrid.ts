import type { StoryChoiceOptionRow } from '../../../storylines/storyTypes';

/** 3×3 choice grid — up to nine options. */
export const STORY_CHOICE_GRID_COLS = 3;
export const STORY_CHOICE_GRID_ROWS = 3;
export const STORY_CHOICE_GRID_SLOT_COUNT = STORY_CHOICE_GRID_COLS * STORY_CHOICE_GRID_ROWS;

/** Bottom-right cell index in row-major order (0-based). */
export const STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT = STORY_CHOICE_GRID_SLOT_COUNT - 1;

export const STORY_CHOICE_SKIP_OPTION_ID = 'skip';
export const STORY_CHOICE_SKIP_LABEL = 'Leave nothing but footprints';
export const STORY_CHOICE_SKIP_DESCRIPTION = 'Take no upgrade and move on.';

/** @deprecated Use {@link STORY_CHOICE_SKIP_OPTION_ID}. */
export const PRE_MISSION_SKIP_OPTION_ID = STORY_CHOICE_SKIP_OPTION_ID;
/** @deprecated Use {@link STORY_CHOICE_SKIP_LABEL}. */
export const PRE_MISSION_SKIP_LABEL = STORY_CHOICE_SKIP_LABEL;
/** @deprecated Use {@link STORY_CHOICE_SKIP_DESCRIPTION}. */
export const PRE_MISSION_SKIP_DESCRIPTION = STORY_CHOICE_SKIP_DESCRIPTION;

const SKIP_LABEL_PATTERNS = [
    /^leave nothing but footprints$/i,
    /^leave only footprints$/i,
    /^do nothing$/i,
    /^cancel$/i,
];

type ChoiceLike = Pick<StoryChoiceOptionRow, 'id' | 'label' | 'loreTitle'>;

export function isStoryChoiceSkipOption(option: ChoiceLike): boolean {
    if (option.id === STORY_CHOICE_SKIP_OPTION_ID) return true;
    const heading = (option.loreTitle ?? option.label).trim();
    return SKIP_LABEL_PATTERNS.some((pattern) => pattern.test(heading));
}

/**
 * Place options in a fixed 3×3 grid. Skip / cancel / do-nothing options always occupy the
 * bottom-right cell; regular options fill left-to-right, top-to-bottom in the remaining slots.
 */
export function arrangeStoryChoiceGridSlots<T extends ChoiceLike>(
    options: readonly T[],
    syntheticSkip?: T | null,
): (T | null)[] {
    const slots: (T | null)[] = Array.from({ length: STORY_CHOICE_GRID_SLOT_COUNT }, () => null);

    const regular: T[] = [];
    let skipOption: T | null = syntheticSkip ?? null;

    for (const option of options) {
        if (isStoryChoiceSkipOption(option)) {
            if (!skipOption) skipOption = option;
            continue;
        }
        regular.push(option);
    }

    let slotIndex = 0;
    for (const option of regular) {
        if (slotIndex >= STORY_CHOICE_GRID_SLOT_COUNT) break;
        if (skipOption && slotIndex === STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT) {
            slotIndex += 1;
        }
        if (slotIndex >= STORY_CHOICE_GRID_SLOT_COUNT) break;
        slots[slotIndex] = option;
        slotIndex += 1;
    }

    if (skipOption) {
        slots[STORY_CHOICE_GRID_BOTTOM_RIGHT_SLOT] = skipOption;
    }

    return slots;
}

export const STORY_CHOICE_BOTTOM_ROW_CLASS =
    'flex h-full min-h-0 flex-col items-center justify-center px-2 py-1.5 sm:px-3 sm:py-2';
