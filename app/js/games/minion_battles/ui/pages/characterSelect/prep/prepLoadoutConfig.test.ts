import { describe, expect, it } from 'vitest';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import { QUEST_MAP } from '../../../../storylines/questRegistry';
import {
    campfireBackgroundForPrep,
    missionPrepConfig,
    questPrepBackgroundImage,
    questPrepConfig,
} from './prepLoadoutConfig';

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

describe('prep configs', () => {
    it('quest prep syncs the quest lobby map, uses the quest background and does not gate Ready', () => {
        const config = questPrepConfig({ prepBackgroundImage: 'custom.png' }, ['a']);
        expect(config).toEqual({
            lobbyField: 'questPrepLoadoutsByPlayer',
            rememberedAbilityIds: ['a'],
            requireCompleteLoadout: false,
            backgroundImage: 'custom.png',
        });
    });

    it('mission prep syncs the mission lobby map, uses the campfire and gates Ready', () => {
        const config = missionPrepConfig(['b']);
        expect(config).toEqual({
            lobbyField: 'missionPrepLoadoutsByPlayer',
            rememberedAbilityIds: ['b'],
            requireCompleteLoadout: true,
            backgroundImage: STORY_BACKGROUNDS.campfire,
        });
    });
});
