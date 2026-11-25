import { describe, expect, it } from 'vitest';
import {
    INITIAL_STORY_NAV,
    advanceStoryNav,
    canRetreatStoryNav,
    retreatStoryNav,
    type StoryNav,
} from './storyNavigation';

const phrases = [
    { type: 'dialogue' },
    { type: 'dialogue' },
    { type: 'choice' },
    { type: 'dialogue' },
    { type: 'dialogue' },
];

function advanceTimes(nav: StoryNav, n: number): StoryNav {
    let cur = nav;
    for (let i = 0; i < n; i++) cur = advanceStoryNav(cur, phrases);
    return cur;
}

describe('story navigation', () => {
    it('cannot go back from the first phrase', () => {
        expect(canRetreatStoryNav(INITIAL_STORY_NAV)).toBe(false);
        expect(retreatStoryNav(INITIAL_STORY_NAV)).toBe(INITIAL_STORY_NAV);
    });

    it('walks back over dialogue, including onto a choice that is not yet made', () => {
        const atChoice = advanceTimes(INITIAL_STORY_NAV, 2);
        expect(atChoice.index).toBe(2);
        const back = retreatStoryNav(atChoice);
        expect(back.index).toBe(1);
        expect(retreatStoryNav(back).index).toBe(0);
    });

    it('cannot go back past a choice that was made', () => {
        const afterChoice = advanceTimes(INITIAL_STORY_NAV, 3);
        expect(afterChoice.index).toBe(3);
        expect(canRetreatStoryNav(afterChoice)).toBe(false);
        const nextDialogue = advanceStoryNav(afterChoice, phrases);
        expect(retreatStoryNav(nextDialogue).index).toBe(3);
        expect(canRetreatStoryNav(retreatStoryNav(nextDialogue))).toBe(false);
    });
});
