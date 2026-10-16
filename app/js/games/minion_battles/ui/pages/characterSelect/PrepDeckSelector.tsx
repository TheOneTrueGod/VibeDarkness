import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { PREP_ABILITY_SLOT_COUNT } from '../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../testing/testIds';
import { QuestPrepAbilityPicker } from './questPrep/QuestPrepAbilityPicker';
import { isPrepDeckSelectorUnlocked } from './loadoutSelection';

export const PREP_DECK_SELECTOR_LOCKED_LABEL = 'Not unlocked yet';

interface PrepDeckSelectorProps {
    character: CampaignCharacter;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
    /**
     * Whether the picker itself is shown once unlocked (e.g. the "Edit Abilities" toggle on the
     * unified layout). The locked notice ignores this and is always shown.
     */
    open?: boolean;
}

/**
 * Deck selector shared by Quest Prep (side quests) and Prepare Carefully (regular missions).
 * One show/hide rule for both: with no more abilities than slots there is nothing to choose, so
 * it shows "Not unlocked yet"; otherwise the ability picker (when `open`).
 */
export function PrepDeckSelector({
    character,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
    open = true,
}: PrepDeckSelectorProps) {
    if (!isPrepDeckSelectorUnlocked(selectableIds.length)) {
        return <PrepDeckSelectorLocked />;
    }
    if (!open) return null;
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

/** Compact notice shown in place of the deck selector before it is relevant. */
export function PrepDeckSelectorLocked() {
    return (
        <div
            data-testid={TestIds.prepDeckSelectorLocked}
            className="flex min-h-0 flex-1 items-center justify-center px-1 py-4"
        >
            <div className="rounded-xl border border-border-custom bg-black/60 px-5 py-3 text-center backdrop-blur-sm">
                <p className="text-sm font-semibold text-white">Deck selection</p>
                <p className="text-sm text-amber-200">{PREP_DECK_SELECTOR_LOCKED_LABEL}</p>
                <p className="mt-1 max-w-[260px] text-xs text-muted">
                    You bring every ability you have. Once you have more than {PREP_ABILITY_SLOT_COUNT}, you
                    choose which to take.
                </p>
            </div>
        </div>
    );
}
