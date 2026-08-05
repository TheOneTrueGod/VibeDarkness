import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { SPECTATOR_ID, isControlEnemy } from '../../../state';
import { TestIds } from '../../../../../testing/testIds';

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
    onSetReady,
    onOpenEditor,
    onCloseEditor,
}: CharacterSelectFooterProps) {
    if (activeTab === 'players') return null;

    const showReady = view !== 'grid';
    const readyBlocked = effectivelyReady || setReadyLoading || !abilityLoadoutReady;
    const readyBtn = showReady && mySelection && (
        <button
            type="button"
            data-testid={TestIds.characterSelectReady}
            disabled={readyBlocked}
            className={`px-8 py-3 text-lg font-bold rounded-lg transition-colors shadow-lg ${
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
        <div className="flex justify-center gap-4 py-4 px-5 shrink-0">
            {editorOpen ? (
                <>
                    <button
                        type="button"
                        className="px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer"
                        onClick={onCloseEditor}
                    >
                        Back
                    </button>
                    {readyBtn}
                </>
            ) : (
                <>
                    {isAdmin && mySelection && mySelection !== SPECTATOR_ID && !isControlEnemy(mySelection) && characterToEdit && (
                        <button
                            type="button"
                            className="px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer"
                            onClick={onOpenEditor}
                        >
                            Edit Character
                        </button>
                    )}
                    {readyBtn}
                    {showReady && mySelection && !abilityLoadoutReady && !effectivelyReady && (
                        <p className="text-yellow-400/80 py-2 text-sm">
                            Select 7 abilities to continue
                        </p>
                    )}
                    {!allRequiredPlayersPresent && (
                        <p className="text-yellow-400/80 py-2 text-sm">
                            Waiting for{' '}
                            {resolvedRequiredPlayers
                                .filter((r) => r.connectedPlayer === null)
                                .map((r) => r.playerName)
                                .join(', ')}{' '}
                            to join…
                        </p>
                    )}
                    {allRequiredPlayersPresent && allSelected && allReady && !atLeastOneCharacter && (
                        <p className="text-muted py-2">At least one player must choose a character to start.</p>
                    )}
                    {allRequiredPlayersPresent && allSelected && allReady && atLeastOneCharacter && (
                        <p className="text-muted py-2">All ready! Proceeding...</p>
                    )}
                </>
            )}
        </div>
    );
}
