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
    /** Remaining endurance bar below the portrait, above Change Characters. */
    enduranceSection?: ReactNode;
    showPortraitArrows: boolean;
    onPrevPortrait: () => void;
    onNextPortrait: () => void;
    onChangeCharacters?: () => void;
    portrait?: ReactNode;
    leftByTab: Partial<Record<CharacterInnerTabId, ReactNode>>;
    children: ReactNode;
}

const HEADER_SURFACE = 'bg-background/50';

/** Campaign-home character chrome: name, portrait, Change Characters + arrows, left-column switch. */
export function CharactersTabLayerOne({
    tab,
    onSelectTab,
    visibleTabs,
    nameSection,
    enduranceSection,
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
    const showPortraitActions = showChangeCharacters || showPortraitArrows;

    return (
        <div className="flex h-full w-full min-h-0 overflow-hidden bg-surface">
            <div className={`flex ${CHARACTER_EDITOR_LEFT_WIDTH_CLASS} shrink-0 flex-col border-r border-border-custom ${HEADER_SURFACE}`}>
                <div className="flex flex-col shrink-0 max-w-full box-border border-b border-border-custom p-4">
                    <div className="flex flex-col gap-2 min-w-0 border-b border-border-custom pb-3">
                        <div className="flex items-center gap-2 min-w-0">{nameSection}</div>
                    </div>
                    {portrait}
                    {enduranceSection && (
                        <div className="mt-3 flex justify-center">{enduranceSection}</div>
                    )}
                    {showPortraitActions && (
                        <div className="mt-3 flex items-center gap-2">
                            {showChangeCharacters && (
                                <button
                                    type="button"
                                    data-testid={TestIds.charactersChange}
                                    onClick={onChangeCharacters}
                                    className="flex-1 min-w-0 rounded-lg border border-border-custom bg-surface-light px-3 py-1.5 text-xs font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                                >
                                    {CHANGE_CHARACTERS_LABEL}
                                </button>
                            )}
                            {showPortraitArrows && (
                                <PortraitCycleButtons onPrev={onPrevPortrait} onNext={onNextPortrait} />
                            )}
                        </div>
                    )}
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
