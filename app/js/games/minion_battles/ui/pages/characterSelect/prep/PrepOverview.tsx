import React from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from '../CharacterSelectCornerPortrait';
import { PrepDeckSelector } from './PrepDeckSelector';

interface PrepOverviewProps {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
    useLayoutSlots?: boolean;
    selectionRequired: boolean;
    /** Picker is hidden by default; the "Edit Abilities" footer button opens it. */
    pickerOpen?: boolean;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
}

/**
 * Center segment for the prep screens (Quest Prep and Prepare Carefully).
 * Uses the shared `PrepDeckSelector`: under the ability cap it renders nothing (the prep
 * background shows); over it, the ability picker.
 */
export function PrepOverview({
    character,
    onChangeCharacter,
    useLayoutSlots = false,
    selectionRequired,
    pickerOpen = false,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: PrepOverviewProps) {
    const deckSelector = (open: boolean) => (
        <PrepDeckSelector
            character={character}
            selectableIds={selectableIds}
            selectedPrimaryIds={selectedPrimaryIds}
            slotsFull={slotsFull}
            onAdd={onAdd}
            open={open}
        />
    );

    if (useLayoutSlots) {
        // The picker only appears once unlocked and "Edit Abilities" opens it; otherwise the
        // prep background shows on its own.
        if (!selectionRequired || !pickerOpen) {
            return null;
        }
        return (
            <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-4">
                <div className="flex min-h-0 max-h-full flex-col rounded-xl bg-black/50 p-3 backdrop-blur-sm">
                    {deckSelector(pickerOpen)}
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-2 pt-2">
            <div className="flex shrink-0 justify-center" style={{ height: 200 }}>
                <CharacterSelectCornerPortrait
                    character={character}
                    onChangeCharacter={onChangeCharacter}
                />
            </div>
            <div className="min-h-0 flex-1">
                {deckSelector(true)}
            </div>
        </div>
    );
}
