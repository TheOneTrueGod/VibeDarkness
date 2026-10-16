import React from 'react';
import { playerDoesNotNeedLoadoutSelection } from './loadoutSelection';
import { CharacterSelectLoadoutEmptyState } from './CharacterSelectLoadoutEmptyState';

/** Center loadout UI on the Prepare Carefully (overview) view. */
export function CharacterSelectLoadoutSelector({
    selectionRequired = false,
}: {
    selectionRequired?: boolean;
}) {
    if (playerDoesNotNeedLoadoutSelection(selectionRequired)) {
        return <CharacterSelectLoadoutEmptyState />;
    }

    // Interactive picker (or its "Not unlocked yet" notice) is the shared PrepDeckSelector,
    // rendered by MissionPrepOverview / QuestPrepOverview.
    return null;
}
