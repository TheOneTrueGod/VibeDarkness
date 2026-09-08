import { describe, expect, it } from 'vitest';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import { campfireBackgroundForPrep } from './MissionPrepSlotLayout';

describe('campfireBackgroundForPrep', () => {
    it('uses the story campfire when no loadout pick is required', () => {
        expect(campfireBackgroundForPrep(false)).toBe(STORY_BACKGROUNDS.campfire);
    });

    it('omits the background when ability selection is required', () => {
        expect(campfireBackgroundForPrep(true)).toBeUndefined();
    });
});
