import React from 'react';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import type { QuestDef } from '../../../../storylines/questTypes';
import CharacterSelectLayout, { type CharacterSelectLayoutProps } from '../CharacterSelectLayout';

type MissionPrepSlotLayoutProps = Omit<CharacterSelectLayoutProps, 'backgroundImage'>;

/** Campfire always fills the center slot; the ability picker is overlaid on top of it. */
export function campfireBackgroundForPrep(): string {
    return STORY_BACKGROUNDS.campfire;
}

/** Quest Prep center background: the quest's own static background, else the campfire. */
export function questPrepBackgroundImage(quest: Pick<QuestDef, 'prepBackgroundImage'> | undefined): string {
    return quest?.prepBackgroundImage ?? campfireBackgroundForPrep();
}

/**
 * Prepare Carefully slot shell: campfire fills the center slot (story `bg-cover`)
 * behind the ability picker.
 */
export function MissionPrepSlotLayout(props: MissionPrepSlotLayoutProps) {
    return <CharacterSelectLayout {...props} backgroundImage={campfireBackgroundForPrep()} />;
}
