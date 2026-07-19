import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';

interface CharacterSelectHeaderProps {
    activeTab: 'characters' | 'players' | 'replay';
    isAdmin: boolean;
    editorOpen: boolean;
    characterToEdit: CampaignCharacter | null;
    /** 'overview' = loadout main view; 'grid' = pick / change character. */
    view: 'overview' | 'grid';
}

/** Center-column title only; admin tabs live in CharacterSelectAdminTabsCorner. */
export function CharacterSelectHeader({
    activeTab,
    isAdmin,
    editorOpen,
    characterToEdit,
    view,
}: CharacterSelectHeaderProps) {
    const title =
        activeTab === 'players' && isAdmin
            ? 'Players'
            : editorOpen && characterToEdit
              ? 'Edit character'
              : view === 'overview'
                ? 'Select your Loadout'
                : 'Select your character';

    return (
        <div className="flex items-center justify-center px-5 py-5 shrink-0">
            <h2 className="text-[32px] font-bold shrink-0">{title}</h2>
        </div>
    );
}
