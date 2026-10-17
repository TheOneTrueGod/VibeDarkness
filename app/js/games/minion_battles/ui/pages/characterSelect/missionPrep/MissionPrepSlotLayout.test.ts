import { describe, expect, it } from 'vitest';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import { QUEST_MAP } from '../../../../storylines/questRegistry';
import { campfireBackgroundForPrep, questPrepBackgroundImage } from './MissionPrepSlotLayout';

describe('campfireBackgroundForPrep', () => {
    it('always uses the story campfire, even when ability selection is required', () => {
        expect(campfireBackgroundForPrep()).toBe(STORY_BACKGROUNDS.campfire);
    });
});

describe('questPrepBackgroundImage', () => {
    it("uses the quest's own prep background", () => {
        expect(questPrepBackgroundImage({ prepBackgroundImage: 'custom.png' })).toBe('custom.png');
    });

    it('falls back to the campfire when the quest is unknown or has none', () => {
        expect(questPrepBackgroundImage(undefined)).toBe(STORY_BACKGROUNDS.campfire);
        expect(questPrepBackgroundImage({})).toBe(STORY_BACKGROUNDS.campfire);
    });

    it('is defined on every registered quest', () => {
        for (const quest of Object.values(QUEST_MAP)) {
            expect(quest.prepBackgroundImage, quest.id).toBeTruthy();
        }
    });
});
