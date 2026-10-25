import React from 'react';
import { TestIds } from '../../../../../testing/testIds';
import type { CharacterEditorTab } from '../../../../../components/CampaignHomeScreen/CharactersTab/characterInnerTabMap';

export interface CharacterEditorTabBarProps {
    activeTab: CharacterEditorTab;
    onSelectTab: (tab: CharacterEditorTab) => void;
    hideMissionMap: boolean;
    isAdmin: boolean;
    showUpgradesTab: boolean;
    showStatBonusesTab: boolean;
    /** Right-aligned actions (the admin panels toggle). */
    actions?: React.ReactNode;
}

/** Local-state tab strip used by the lobby (non-routed) Character Editor. */
export default function CharacterEditorTabBar({
    activeTab,
    onSelectTab,
    hideMissionMap,
    isAdmin,
    showUpgradesTab,
    showStatBonusesTab,
    actions,
}: CharacterEditorTabBarProps) {
    return (
        <div className="flex gap-1 px-2 pt-2 border-b border-border-custom shrink-0">
            {!hideMissionMap && (
                <button
                    type="button"
                    data-testid={TestIds.characterEditorMissionMapTab}
                    className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                        activeTab === 'missionMap'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted hover:text-white'
                    }`}
                    onClick={() => onSelectTab('missionMap')}
                >
                    Mission Map
                </button>
            )}
            {isAdmin && (
                <button
                    type="button"
                    className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                        activeTab === 'equipment'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted hover:text-white'
                    }`}
                    onClick={() => onSelectTab('equipment')}
                >
                    Equipment
                </button>
            )}
            {showUpgradesTab && (
                <button
                    type="button"
                    className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                        activeTab === 'research'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted hover:text-white'
                    }`}
                    onClick={() => onSelectTab('research')}
                >
                    Upgrades
                </button>
            )}
            {showStatBonusesTab && (
                <button
                    type="button"
                    className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                        activeTab === 'statBonuses'
                            ? 'border-primary text-primary'
                            : 'border-transparent text-muted hover:text-white'
                    }`}
                    onClick={() => onSelectTab('statBonuses')}
                >
                    Stat Bonuses
                </button>
            )}
            {actions}
        </div>
    );
}
