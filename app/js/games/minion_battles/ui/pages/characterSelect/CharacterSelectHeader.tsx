import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { TestIds } from '../../../../../testing/testIds';

interface CharacterSelectHeaderProps {
    activeTab: 'characters' | 'players' | 'replay';
    isAdmin: boolean;
    editorOpen: boolean;
    characterToEdit: CampaignCharacter | null;
    /** 'overview' = loadout main view; 'grid' = pick / change character. */
    view: 'overview' | 'grid';
    /** Optional subtitle under the title (e.g. Quest Prep). */
    subtitle?: string | null;
    /** data-testid for the subtitle element when present. */
    subtitleTestId?: string;
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
}: CharacterSelectHeaderProps) {
    const title =
        activeTab === 'players' && isAdmin
            ? 'Players'
            : editorOpen && characterToEdit
              ? 'Edit character'
              : view === 'overview'
                ? 'Prepare Carefully'
                : 'Select your character';

    return (
        <div className="flex flex-col items-center justify-center px-5 py-5 shrink-0 gap-1">
            <h2 className="text-[32px] font-bold shrink-0">{title}</h2>
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
