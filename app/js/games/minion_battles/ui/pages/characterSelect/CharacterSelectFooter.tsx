import React, { useRef, useState } from 'react';
import { AnchoredPortalTooltip } from '../../components/AnchoredPortalTooltip';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { SPECTATOR_ID, isControlEnemy } from '../../../state';
import { TestIds } from '../../../../../testing/testIds';
import { useDebugConsole } from '../../../../../contexts/DebugConsoleContext';

interface CharacterSelectFooterProps {
    activeTab: 'characters' | 'players' | 'replay';
    /** 'overview' = loadout; 'grid' = pick / change character (Ready hidden). */
    view: 'overview' | 'grid';
    editorOpen: boolean;
    isAdmin: boolean;
    mySelection: string | null;
    effectivelyReady: boolean;
    setReadyLoading: boolean;
    allRequiredPlayersPresent: boolean;
    allSelected: boolean;
    allReady: boolean;
    atLeastOneCharacter: boolean;
    resolvedRequiredPlayers: Array<{ playerName: string; connectedPlayer: unknown | null }>;
    characterToEdit: CampaignCharacter | null;
    /** False when mission ability selection is incomplete (over-cap and fewer than 7 picks). */
    abilityLoadoutReady?: boolean;
    /** Compact padding when rendered above the bottom ability band. */
    compact?: boolean;
    /** When set, an "Edit Abilities" button is shown left of "Edit Character". */
    onEditAbilities?: () => void;
    /** True while the ability picker is open (button becomes a "Hide Abilities" toggle). */
    abilityPickerOpen?: boolean;
    /** When set, an "Edit Modifiers" button (Darkness Upgrades) is shown. */
    onEditModifiers?: () => void;
    /** Why Ready is blocked by the modifier selection (shown as a tooltip and message), or null. */
    modifiersBlockReason?: string | null;
    onSetReady: () => void;
    onOpenEditor: () => void;
    onCloseEditor: () => void;
}

export function CharacterSelectFooter({
    activeTab,
    view,
    editorOpen,
    isAdmin,
    mySelection,
    effectivelyReady,
    setReadyLoading,
    allRequiredPlayersPresent,
    allSelected,
    allReady,
    atLeastOneCharacter,
    resolvedRequiredPlayers,
    characterToEdit,
    abilityLoadoutReady = true,
    compact = false,
    onEditAbilities,
    abilityPickerOpen = false,
    onEditModifiers,
    modifiersBlockReason = null,
    onSetReady,
    onOpenEditor,
    onCloseEditor,
}: CharacterSelectFooterProps) {
    const { debugConsoleEnabled } = useDebugConsole();
    const readyAnchorRef = useRef<HTMLDivElement>(null);
    const [readyTipOpen, setReadyTipOpen] = useState(false);
    if (activeTab === 'players') return null;

    const showReady = view !== 'grid';
    const showEditCharacter =
        (isAdmin || debugConsoleEnabled)
        && !!mySelection
        && mySelection !== SPECTATOR_ID
        && !isControlEnemy(mySelection)
        && !!characterToEdit;
    const readyBlocked = effectivelyReady || setReadyLoading || !abilityLoadoutReady || modifiersBlockReason != null;
    const secondaryBtnClass = compact
        ? 'px-3 py-1 text-xs font-medium rounded-md border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer'
        : 'px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer';
    const readyBtn = showReady && mySelection && (
        <button
            type="button"
            data-testid={TestIds.characterSelectReady}
            disabled={readyBlocked}
            className={`${compact ? 'px-4 py-1 text-sm' : 'px-8 py-3 text-lg'} font-bold rounded-lg transition-colors shadow-lg ${
                readyBlocked
                    ? 'bg-gray-600 text-gray-400 cursor-default'
                    : 'bg-primary text-secondary hover:opacity-90 cursor-pointer'
            }`}
            onClick={onSetReady}
        >
            Ready
        </button>
    );

    return (
        <div
            className={`flex flex-wrap justify-center items-center shrink-0 ${
                compact ? 'gap-2 px-2 py-0' : 'gap-4 px-5 py-4'
            }`}
        >
            {editorOpen ? (
                <>
                    <button
                        type="button"
                        className={secondaryBtnClass}
                        onClick={onCloseEditor}
                    >
                        Back
                    </button>
                    {readyBtn}
                </>
            ) : (
                <>
                    {onEditAbilities && (
                        <button
                            type="button"
                            className={secondaryBtnClass}
                            onClick={onEditAbilities}
                        >
                            {abilityPickerOpen ? 'Hide Abilities' : 'Edit Abilities'}
                        </button>
                    )}
                    {showEditCharacter && (
                        <button
                            type="button"
                            className={secondaryBtnClass}
                            onClick={onOpenEditor}
                        >
                            Edit Character
                        </button>
                    )}
                    {onEditModifiers && (
                        <button
                            type="button"
                            className={secondaryBtnClass}
                            onClick={onEditModifiers}
                        >
                            Edit Modifiers
                        </button>
                    )}
                    {modifiersBlockReason && readyBtn ? (
                        <div
                            ref={readyAnchorRef}
                            onMouseEnter={() => setReadyTipOpen(true)}
                            onMouseLeave={() => setReadyTipOpen(false)}
                        >
                            {readyBtn}
                            <AnchoredPortalTooltip
                                anchorRef={readyAnchorRef}
                                open={readyTipOpen}
                                placement="top"
                                className="max-w-[240px] px-2.5 py-1.5 text-left"
                            >
                                <p className="text-xs leading-snug">{modifiersBlockReason}</p>
                            </AnchoredPortalTooltip>
                        </div>
                    ) : readyBtn}
                    {modifiersBlockReason && !effectivelyReady && (
                        <p className="text-yellow-400/80 py-1 text-sm">{modifiersBlockReason}</p>
                    )}
                    {showReady && mySelection && !abilityLoadoutReady && !effectivelyReady && (
                        <p className="text-yellow-400/80 py-1 text-sm">
                            Select 7 abilities to continue
                        </p>
                    )}
                    {!allRequiredPlayersPresent && (
                        <p className="text-yellow-400/80 py-1 text-sm">
                            Waiting for{' '}
                            {resolvedRequiredPlayers
                                .filter((r) => r.connectedPlayer === null)
                                .map((r) => r.playerName)
                                .join(', ')}{' '}
                            to join…
                        </p>
                    )}
                    {allRequiredPlayersPresent && allSelected && allReady && !atLeastOneCharacter && (
                        <p className="text-muted py-1 text-sm">At least one player must choose a character to start.</p>
                    )}
                    {allRequiredPlayersPresent && allSelected && allReady && atLeastOneCharacter && (
                        <p className="text-muted py-1 text-sm">All ready! Proceeding...</p>
                    )}
                </>
            )}
        </div>
    );
}
