import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { QuestPrepAbilityPicker } from './questPrep/QuestPrepAbilityPicker';
import { isPrepDeckSelectorUnlocked } from './loadoutSelection';

interface PrepDeckSelectorProps {
    character: CampaignCharacter;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
    /**
     * Whether the picker itself is shown once unlocked (e.g. the "Edit Abilities" toggle on the
     * unified layout). Ignored while locked: nothing renders.
     */
    open?: boolean;
}

/**
 * Deck selector shared by Quest Prep (side quests) and Prepare Carefully (regular missions).
 * One show/hide rule for both: with no more abilities than slots there is nothing to choose, so
 * it renders nothing and the prep background shows through; otherwise the ability picker (when `open`).
 */
export function PrepDeckSelector({
    character,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
    open = true,
}: PrepDeckSelectorProps) {
    if (!isPrepDeckSelectorUnlocked(selectableIds.length) || !open) return null;
    return (
        <QuestPrepAbilityPicker
            character={character}
            selectableIds={selectableIds}
            selectedPrimaryIds={selectedPrimaryIds}
            slotsFull={slotsFull}
            onAdd={onAdd}
        />
    );
}
