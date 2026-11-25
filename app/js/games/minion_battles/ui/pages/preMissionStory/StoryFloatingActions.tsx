import React from 'react';
import { TestIds } from '../../../../../testing/testIds';

interface StoryFloatingActionsProps {
    /** Show "Back"; false once a choice/vote has been committed (or at the first phrase). */
    canGoBack: boolean;
    onBack: () => void;
    /** Show "Next" (dialogue steps only; choices advance by being chosen). */
    showNext: boolean;
    onNext: () => void;
    nextTestId?: string;
}

/** Floating Back / Next buttons shown over a story phrase; null when neither applies. */
export default function StoryFloatingActions({
    canGoBack,
    onBack,
    showNext,
    onNext,
    nextTestId,
}: StoryFloatingActionsProps) {
    if (!canGoBack && !showNext) return null;
    return (
        <div className="flex items-center gap-3">
            {canGoBack && (
                <button
                    type="button"
                    data-testid={TestIds.storyBack}
                    onClick={onBack}
                    className="px-5 py-2 bg-black/60 text-white font-semibold rounded-lg shadow-lg border border-white/30 hover:bg-black/80"
                >
                    Back
                </button>
            )}
            {showNext && (
                <button
                    type="button"
                    data-testid={nextTestId}
                    onClick={onNext}
                    className="px-6 py-2 bg-primary text-white font-semibold rounded-lg shadow-lg hover:opacity-90"
                >
                    Next
                </button>
            )}
        </div>
    );
}
