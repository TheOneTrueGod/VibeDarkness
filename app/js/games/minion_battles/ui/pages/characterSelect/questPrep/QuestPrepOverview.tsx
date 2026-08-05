import React from 'react';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from '../CharacterSelectCornerPortrait';
import { QuestPrepAbilityPicker } from './QuestPrepAbilityPicker';

interface QuestPrepOverviewProps {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
    useLayoutSlots?: boolean;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
}

/**
 * Center segment for Quest Prep (separate from normal Prepare Carefully / CharacterOverview).
 */
export function QuestPrepOverview({
    character,
    onChangeCharacter,
    useLayoutSlots = false,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: QuestPrepOverviewProps) {
    if (useLayoutSlots) {
        return (
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-2">
                <QuestPrepAbilityPicker
                    character={character}
                    selectableIds={selectableIds}
                    selectedPrimaryIds={selectedPrimaryIds}
                    slotsFull={slotsFull}
                    onAdd={onAdd}
                />
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
                <QuestPrepAbilityPicker
                    character={character}
                    selectableIds={selectableIds}
                    selectedPrimaryIds={selectedPrimaryIds}
                    slotsFull={slotsFull}
                    onAdd={onAdd}
                />
            </div>
        </div>
    );
}
