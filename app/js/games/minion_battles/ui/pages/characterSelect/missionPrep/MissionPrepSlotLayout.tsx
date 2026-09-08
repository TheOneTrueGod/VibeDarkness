import React from 'react';
import { STORY_BACKGROUNDS } from '../../../../assets/story';
import CharacterSelectLayout, { type CharacterSelectLayoutProps } from '../CharacterSelectLayout';
import { useMissionPrepLoadoutContext } from './MissionPrepLoadoutContext';

type MissionPrepSlotLayoutProps = Omit<CharacterSelectLayoutProps, 'backgroundImage'>;

/** Campfire fills the center slot unless the player must pick abilities. */
export function campfireBackgroundForPrep(selectionRequired: boolean): string | undefined {
    return selectionRequired ? undefined : STORY_BACKGROUNDS.campfire;
}

/**
 * Prepare Carefully slot shell: campfire fills the center slot (story `bg-cover`)
 * when the player has no loadout to pick.
 */
export function MissionPrepSlotLayout(props: MissionPrepSlotLayoutProps) {
    const { selectionRequired } = useMissionPrepLoadoutContext();
    return (
        <CharacterSelectLayout
            {...props}
            backgroundImage={campfireBackgroundForPrep(selectionRequired)}
        />
    );
}
