import React from 'react';
import { STORY_CHOICE_GRID_SLOT_COUNT } from '../../pages/preMissionStory/storyChoiceGrid';

interface StoryChoiceGridProps {
    /** Exactly nine cells; `null` renders an empty slot (preserves 3×3 layout). */
    cells: ReadonlyArray<React.ReactNode | null>;
}

export const STORY_CHOICE_CELL_BUTTON_BASE =
    'flex h-full min-h-0 w-full min-w-0 flex-col items-center justify-center overflow-hidden rounded-lg border-2 text-center transition-colors';

/** Default inset. Research-node rewards use {@link STORY_CHOICE_CELL_BUTTON_RESEARCH_PADDING}. */
export const STORY_CHOICE_CELL_BUTTON_PADDING = 'gap-0 px-1.5 py-0.5 sm:px-2 sm:py-1';

/**
 * Research rewards omit the node pill, so the cell keeps two description lines
 * and a larger inset instead of a chip row.
 */
export const STORY_CHOICE_CELL_BUTTON_RESEARCH_PADDING = 'gap-1 px-2.5 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2';

export const STORY_CHOICE_CELL_BUTTON_PRIMARY =
    'border-border-custom bg-surface text-white hover:border-primary hover:bg-surface-light/80';

export const STORY_CHOICE_CELL_BUTTON_SKIP =
    'border-border-custom bg-surface/30 text-zinc-300 hover:border-zinc-400 hover:bg-surface/50 hover:text-zinc-200';

export const STORY_CHOICE_CELL_BUTTON_DISABLED =
    'cursor-not-allowed border-border-custom bg-surface text-zinc-400 opacity-50';

export default function StoryChoiceGrid({ cells }: StoryChoiceGridProps) {
    const normalized =
        cells.length === STORY_CHOICE_GRID_SLOT_COUNT
            ? cells
            : [
                  ...cells,
                  ...Array.from({ length: STORY_CHOICE_GRID_SLOT_COUNT - cells.length }, () => null),
              ].slice(0, STORY_CHOICE_GRID_SLOT_COUNT);

    return (
        <div className="mx-auto grid h-full w-full max-w-4xl grid-cols-3 grid-rows-3 gap-1 sm:gap-1.5">
            {normalized.map((cell, index) => (
                <div key={index} className="flex min-h-0 min-w-0">
                    {cell}
                </div>
            ))}
        </div>
    );
}
