import React from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from '../CharacterSelectCornerPortrait';
import { CharacterSelectLoadoutSelector } from '../CharacterSelectLoadoutSelector';
import { QuestPrepAbilityPicker } from '../questPrep/QuestPrepAbilityPicker';

interface MissionPrepOverviewProps {
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
 * Center segment for regular-mission Prepare Carefully.
 * Under ability cap: campfire empty state. Over cap: ability picker (same as Quest Prep).
 */
export function MissionPrepOverview({
    character,
    onChangeCharacter,
    useLayoutSlots = false,
    selectionRequired,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: MissionPrepOverviewProps) {
    const center = selectionRequired ? (
        <QuestPrepAbilityPicker
            character={character}
            selectableIds={selectableIds}
            selectedPrimaryIds={selectedPrimaryIds}
            slotsFull={slotsFull}
            onAdd={onAdd}
        />
    ) : (
        <CharacterSelectLoadoutSelector selectionRequired={false} />
    );

    if (useLayoutSlots) {
        return (
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-2">
                {center}
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
                {center}
            </div>
        </div>
    );
}
