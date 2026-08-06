import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { TestIds } from '../../../../../testing/testIds';

interface CharacterSelectHeaderTitleArgs {
    activeTab: 'characters' | 'players' | 'replay';
    isAdmin: boolean;
    editorOpen: boolean;
    characterToEdit: CampaignCharacter | null;
    /** 'overview' = loadout main view; 'grid' = pick / change character. */
    view: 'overview' | 'grid';
}

/** Phase title shown in the center column or composed into the lobby header. */
export function getCharacterSelectPhaseTitle({
    activeTab,
    isAdmin,
    editorOpen,
    characterToEdit,
    view,
}: CharacterSelectHeaderTitleArgs): string {
    if (activeTab === 'players' && isAdmin) return 'Players';
    if (editorOpen && characterToEdit) return 'Edit Character';
    if (view === 'overview') return 'Prepare Carefully';
    return 'Select your character';
}

interface CharacterSelectHeaderProps extends CharacterSelectHeaderTitleArgs {
    /** Optional subtitle under the title (e.g. Quest Prep). */
    subtitle?: string | null;
    /** data-testid for the subtitle element when present. */
    subtitleTestId?: string;
    /**
     * When true, the large title is omitted (it lives in the lobby header instead).
     * Subtitle still renders when provided.
     */
    titleInLobbyHeader?: boolean;
}

/** Center-column title only; admin tabs live in CharacterSelectAdminTabsCorner. */
export function CharacterSelectHeader({
    activeTab,
    isAdmin,
    editorOpen,
    characterToEdit,
    view,
    subtitle,
    subtitleTestId,
    titleInLobbyHeader = false,
}: CharacterSelectHeaderProps) {
    const title = getCharacterSelectPhaseTitle({
        activeTab,
        isAdmin,
        editorOpen,
        characterToEdit,
        view,
    });

    if (titleInLobbyHeader && !subtitle) {
        return null;
    }

    return (
        <div
            className={`flex flex-col items-center justify-center px-5 shrink-0 gap-1 ${
                titleInLobbyHeader ? 'py-2' : 'py-5'
            }`}
        >
            {!titleInLobbyHeader ? (
                <h2 className="text-[32px] font-bold shrink-0">{title}</h2>
            ) : null}
            {subtitle ? (
                <p
                    data-testid={subtitleTestId ?? TestIds.questPrepSubtitle}
                    className="text-sm text-amber-100/70 text-center max-w-md"
                >
                    {subtitle}
                </p>
            ) : null}
        </div>
    );
}
