import { describe, expect, it } from 'vitest';
import { FOUND_BERRIES } from '../../../storylines/WorldOfDarkness/questMissions/found_berries';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { storyPhraseBackgroundUrl } from './storyPhraseBackground';

describe('storyPhraseBackgroundUrl', () => {
    it('reads dialogue and choice phrase backgrounds', () => {
        const phrases = FOUND_BERRIES.postMissionStory!.phrases;
        expect(storyPhraseBackgroundUrl(phrases[0])).toBe(STORY_BACKGROUNDS.campfire);
        expect(storyPhraseBackgroundUrl(phrases[1])).toBe(STORY_BACKGROUNDS.foundBerries);
    });
});
