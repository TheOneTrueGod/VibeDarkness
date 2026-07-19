import React from 'react';
import { playerDoesNotNeedLoadoutSelection } from './loadoutSelection';
import { CharacterSelectLoadoutEmptyState } from './CharacterSelectLoadoutEmptyState';

/** Center loadout UI on the Select your Loadout (overview) view. */
export function CharacterSelectLoadoutSelector() {
    if (playerDoesNotNeedLoadoutSelection()) {
        return <CharacterSelectLoadoutEmptyState />;
    }

    // Real loadout controls will go here when selection is required.
    return null;
}
