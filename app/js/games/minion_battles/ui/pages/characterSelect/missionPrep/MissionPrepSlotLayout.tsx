import React from 'react';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import CharacterSelectLayout, { type CharacterSelectLayoutProps } from '../CharacterSelectLayout';

type MissionPrepSlotLayoutProps = Omit<CharacterSelectLayoutProps, 'backgroundImage'>;

/** Campfire always fills the center slot; the ability picker is overlaid on top of it. */
export function campfireBackgroundForPrep(): string {
    return STORY_BACKGROUNDS.campfire;
}

/**
 * Prepare Carefully slot shell: campfire fills the center slot (story `bg-cover`)
 * behind the ability picker.
 */
export function MissionPrepSlotLayout(props: MissionPrepSlotLayoutProps) {
    return <CharacterSelectLayout {...props} backgroundImage={campfireBackgroundForPrep()} />;
}
