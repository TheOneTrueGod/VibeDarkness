import React from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { PrepAbilityPicker } from './PrepAbilityPicker';
import { isPrepDeckSelectorUnlocked } from '../loadoutSelection';

interface PrepDeckSelectorProps {
    character: CampaignCharacter;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
}

/**
 * Deck selector on the Prepare screen (side quests and regular missions).
 * With no more abilities than slots there is nothing to choose, so it renders nothing and the
 * prep background shows through; otherwise the ability picker.
 */
export function PrepDeckSelector({
    character,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: PrepDeckSelectorProps) {
    if (!isPrepDeckSelectorUnlocked(selectableIds.length)) return null;
    return (
        <PrepAbilityPicker
            character={character}
            selectableIds={selectableIds}
            selectedPrimaryIds={selectedPrimaryIds}
            slotsFull={slotsFull}
            onAdd={onAdd}
        />
    );
}
