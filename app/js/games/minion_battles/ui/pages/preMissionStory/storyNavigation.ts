/**
 * Back-navigation for pre/post-mission story phases.
 *
 * Only plain dialogue steps can be walked back over. Passing any other phrase (a choice, group vote, grant
 * or hunger recovery) clears the history: choices and votes are multiplayer commitment points that are sent
 * to the server and cannot be undone, and grant phrases have one-shot side effects that must not re-run.
 */
export interface StoryNav {
    /** Index of the phrase being shown. */
    index: number;
    /** Dialogue phrase indices already read since the last commitment point, oldest first. */
    history: readonly number[];
}

export const INITIAL_STORY_NAV: StoryNav = { index: 0, history: [] };

/** Move to the next phrase, remembering the current one only when it was plain dialogue. */
export function advanceStoryNav(nav: StoryNav, phrases: readonly { type: string }[]): StoryNav {
    const index = Math.min(nav.index + 1, phrases.length);
    const wasDialogue = phrases[nav.index]?.type === 'dialogue';
    return { index, history: wasDialogue ? [...nav.history, nav.index] : [] };
}

/** Step back to the previously read dialogue phrase; unchanged when there is nothing to go back to. */
export function retreatStoryNav(nav: StoryNav): StoryNav {
    if (nav.history.length === 0) return nav;
    return { index: nav.history[nav.history.length - 1], history: nav.history.slice(0, -1) };
}

export function canRetreatStoryNav(nav: StoryNav): boolean {
    return nav.history.length > 0;
}
