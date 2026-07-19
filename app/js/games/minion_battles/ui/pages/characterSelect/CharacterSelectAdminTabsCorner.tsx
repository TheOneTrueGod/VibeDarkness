import React from 'react';

export type CharacterSelectAdminTab = 'characters' | 'players' | 'replay';

interface CharacterSelectAdminTabsCornerProps {
    activeTab: CharacterSelectAdminTab;
    setActiveTab: (tab: CharacterSelectAdminTab) => void;
}

/** Bottom-right slot: admin Characters / Players / Replay switcher. */
export function CharacterSelectAdminTabsCorner({
    activeTab,
    setActiveTab,
}: CharacterSelectAdminTabsCornerProps) {
    const tabBtn = (tab: CharacterSelectAdminTab, label: string) => (
        <button
            type="button"
            className={`w-full px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                activeTab === tab
                    ? 'border-primary bg-surface-light text-white'
                    : 'border-border-custom bg-surface text-muted hover:text-white hover:border-primary'
            }`}
            onClick={() => setActiveTab(tab)}
        >
            {label}
        </button>
    );

    return (
        <div className="flex h-full w-full min-h-0 flex-col items-stretch justify-center gap-2">
            {tabBtn('characters', 'Characters')}
            {tabBtn('players', 'Players')}
            {tabBtn('replay', 'Replay')}
        </div>
    );
}
