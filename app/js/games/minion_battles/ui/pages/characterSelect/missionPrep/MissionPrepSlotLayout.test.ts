import { describe, expect, it } from 'vitest';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import { campfireBackgroundForPrep } from './MissionPrepSlotLayout';

describe('campfireBackgroundForPrep', () => {
    it('always uses the story campfire, even when ability selection is required', () => {
        expect(campfireBackgroundForPrep()).toBe(STORY_BACKGROUNDS.campfire);
    });
});
