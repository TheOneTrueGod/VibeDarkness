import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';

interface CharacterSelectHeaderProps {
    activeTab: 'characters' | 'players' | 'replay';
    setActiveTab: (tab: 'characters' | 'players' | 'replay') => void;
    isAdmin: boolean;
    editorOpen: boolean;
    characterToEdit: CampaignCharacter | null;
}

export function CharacterSelectHeader({
    activeTab,
    setActiveTab,
    isAdmin,
    editorOpen,
    characterToEdit,
}: CharacterSelectHeaderProps) {
    const tabBtn = (tab: 'characters' | 'players' | 'replay', label: string) => (
        <button
            type="button"
            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                activeTab === tab
                    ? 'border-primary bg-surface-light text-white'
                    : 'border-border-custom bg-surface text-muted hover:text-white hover:border-primary'
            }`}
            onClick={() => setActiveTab(tab)}
        >
            {label}
        </button>
    );

    const title =
        activeTab === 'players' && isAdmin
            ? 'Players'
            : editorOpen && characterToEdit
              ? 'Edit character'
              : 'Select your character';

    return (
        <div className="flex items-center px-5 py-5 shrink-0">
            <div className="flex-1 flex gap-2">
                {(!(editorOpen && characterToEdit) || isAdmin) && !(editorOpen && characterToEdit) &&
                    tabBtn('characters', 'Characters')}
                {isAdmin && tabBtn('players', 'Players')}
                {isAdmin && tabBtn('replay', 'Replay')}
            </div>
            <h2 className="text-[32px] font-bold shrink-0">{title}</h2>
            <div className="flex-1" />
        </div>
    );
}
