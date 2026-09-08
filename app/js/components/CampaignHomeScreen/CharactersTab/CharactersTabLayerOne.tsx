import type { ReactNode } from 'react';
import { TestIds } from '../../../testing/testIds';
import {
    CHANGE_CHARACTERS_LABEL,
    CHARACTER_EDITOR_LEFT_WIDTH_CLASS,
} from '../../../games/minion_battles/ui/components/characters/CharacterListPullout';
import { PortraitCycleButtons } from '../../../games/minion_battles/ui/components/CharacterEditor/PortraitCycleButtons';
import type { CharacterInnerTabId } from '../../ability-tests/campaignTabPaths';
import { innerTabShowsChangeCharacters } from './characterInnerTabMap';

export const CHARACTER_INNER_TAB_LABEL: Record<CharacterInnerTabId, string> = {
    map: 'Mission Map',
    upgrades: 'Upgrades',
    bonuses: 'Stat Bonuses',
    equipment: 'Equipment',
};

export function characterInnerTabTestId(tab: CharacterInnerTabId): string {
    if (tab === 'map') return TestIds.characterEditorMissionMapTab;
    return `character-editor-tab-${tab}`;
}

interface CharactersTabLayerOneProps {
    tab: CharacterInnerTabId;
    onSelectTab: (tab: CharacterInnerTabId) => void;
    visibleTabs: CharacterInnerTabId[];
    nameSection: ReactNode;
    showPortraitArrows: boolean;
    onPrevPortrait: () => void;
    onNextPortrait: () => void;
    onChangeCharacters?: () => void;
    portrait?: ReactNode;
    leftByTab: Partial<Record<CharacterInnerTabId, ReactNode>>;
    children: ReactNode;
}

const HEADER_SURFACE = 'bg-background/50';

/** Campaign-home character chrome: name, tabs, Change Characters, and left-column switch. */
export function CharactersTabLayerOne({
    tab,
    onSelectTab,
    visibleTabs,
    nameSection,
    showPortraitArrows,
    onPrevPortrait,
    onNextPortrait,
    onChangeCharacters,
    portrait,
    leftByTab,
    children,
}: CharactersTabLayerOneProps) {
    const leftContent = leftByTab[tab] ?? null;
    const showChangeCharacters = Boolean(onChangeCharacters) && innerTabShowsChangeCharacters(tab);

    return (
        <div className="flex h-full w-full min-h-0 overflow-hidden bg-surface">
            <div className={`flex ${CHARACTER_EDITOR_LEFT_WIDTH_CLASS} shrink-0 flex-col border-r border-border-custom ${HEADER_SURFACE}`}>
                <div className="flex flex-col shrink-0 max-w-full box-border border-b border-border-custom p-4">
                    <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                            {nameSection}
                        </div>
                        {showPortraitArrows && (
                            <PortraitCycleButtons onPrev={onPrevPortrait} onNext={onNextPortrait} />
                        )}
                    </div>
                    {showChangeCharacters && (
                        <div className="border-t border-border-custom mt-3 pt-3">
                            <button
                                type="button"
                                data-testid={TestIds.charactersChange}
                                onClick={onChangeCharacters}
                                className="w-full rounded-lg border border-border-custom bg-surface-light px-3 py-1.5 text-xs font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                            >
                                {CHANGE_CHARACTERS_LABEL}
                            </button>
                        </div>
                    )}
                    {portrait}
                </div>
                <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    {leftContent}
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className={`flex shrink-0 gap-1 px-2 border-b border-border-custom ${HEADER_SURFACE}`}>
                    {visibleTabs.map((id) => (
                        <button
                            key={id}
                            type="button"
                            data-testid={characterInnerTabTestId(id)}
                            className={`px-3 py-2 border-b-2 text-sm cursor-pointer ${
                                tab === id
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => onSelectTab(id)}
                        >
                            {CHARACTER_INNER_TAB_LABEL[id]}
                        </button>
                    ))}
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
            </div>
        </div>
    );
}
