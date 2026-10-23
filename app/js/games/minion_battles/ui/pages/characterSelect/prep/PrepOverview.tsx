import React from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from '../CharacterSelectCornerPortrait';
import { PrepDeckSelector } from './PrepDeckSelector';

interface PrepOverviewProps {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
    useLayoutSlots?: boolean;
    selectionRequired: boolean;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
}

/**
 * Center segment of the Prepare screen (side-quest Quest Prep and regular missions).
 * Uses the shared `PrepDeckSelector`: under the ability cap it renders nothing (the prep
 * background shows); over it, the ability picker.
 */
export function PrepOverview({
    character,
    onChangeCharacter,
    useLayoutSlots = false,
    selectionRequired,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: PrepOverviewProps) {
    const deckSelector = (
        <PrepDeckSelector
            character={character}
            selectableIds={selectableIds}
            selectedPrimaryIds={selectedPrimaryIds}
            slotsFull={slotsFull}
            onAdd={onAdd}
        />
    );

    if (useLayoutSlots) {
        // Over the ability cap the picker is the default Prepare view; otherwise the prep
        // background shows on its own.
        if (!selectionRequired) {
            return null;
        }
        return (
            <div className="flex min-h-0 flex-1 flex-col justify-center px-5 py-4">
                <div className="flex min-h-0 max-h-full flex-col rounded-xl bg-black/50 p-3 backdrop-blur-sm">
                    {deckSelector}
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
                {deckSelector}
            </div>
        </div>
    );
}
