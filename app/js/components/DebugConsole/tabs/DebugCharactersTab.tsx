import React, { useCallback, useEffect, useState } from 'react';
import type { CampaignCharacterPayload } from '../../../LobbyClient';
import type { DebugConsoleProps } from '../DebugConsole';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugCharactersTabProps {
    isActive: boolean;
    fetchCharactersList: DebugConsoleProps['fetchCharactersList'];
    getCharacter: DebugConsoleProps['getCharacter'];
    onListMetaChange?: (meta: { isNull: boolean; isLoading: boolean }) => void;
}

export default function DebugCharactersTab({ isActive, fetchCharactersList, getCharacter, onListMetaChange }: DebugCharactersTabProps) {
    const [charactersList, setCharactersList] = useState<CampaignCharacterPayload[] | null>(null);
    const [charactersListLoading, setCharactersListLoading] = useState(false);
    const [charactersListError, setCharactersListError] = useState<string | null>(null);
    const [didAttemptListLoad, setDidAttemptListLoad] = useState(false);

    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [characterDetail, setCharacterDetail] = useState<CampaignCharacterPayload | null>(null);
    const [characterDetailLoading, setCharacterDetailLoading] = useState(false);
    const [characterDetailError, setCharacterDetailError] = useState<string | null>(null);

    const loadCharactersList = useCallback(async () => {
        setCharactersListLoading(true);
        setCharactersListError(null);
        try {
            const list = await fetchCharactersList();
            setCharactersList(list);
        } catch (err) {
            setCharactersListError(err instanceof Error ? err.message : 'Failed to load characters');
            setCharactersList(null);
        } finally {
            setCharactersListLoading(false);
            setDidAttemptListLoad(true);
        }
    }, [fetchCharactersList]);

    useEffect(() => {
        onListMetaChange?.({ isNull: charactersList === null, isLoading: charactersListLoading });
    }, [charactersList, charactersListLoading, onListMetaChange]);

    useEffect(() => {
        if (!isActive) return;
        if (didAttemptListLoad) return;
        void loadCharactersList();
    }, [isActive, didAttemptListLoad, loadCharactersList]);

    const loadCharacterDetail = useCallback(
        async (characterId: string) => {
            setCharacterDetailLoading(true);
            setCharacterDetailError(null);
            try {
                const char = await getCharacter(characterId);
                setCharacterDetail(char);
            } catch (err) {
                setCharacterDetailError(err instanceof Error ? err.message : 'Failed to load character');
                setCharacterDetail(null);
            } finally {
                setCharacterDetailLoading(false);
            }
        },
        [getCharacter],
    );

    useEffect(() => {
        if (isActive && selectedCharacterId) {
            void loadCharacterDetail(selectedCharacterId);
            return;
        }

        // Match original behavior: when leaving the Characters tab, clear detail + error.
        setCharacterDetail(null);
        setCharacterDetailError(null);
        setCharacterDetailLoading(false);
    }, [isActive, selectedCharacterId, loadCharacterDetail]);

    if (!isActive) return null;

    return (
        <div className="flex flex-1 min-h-0 gap-3">
            <div className="flex flex-col shrink-0 w-40 border-r border-border-custom pr-2">
                {charactersListLoading && <p className="m-0 text-muted text-sm">Loading list...</p>}
                {charactersListError && <p className="m-0 text-red-400 text-sm">{charactersListError}</p>}
                {!charactersListLoading && !charactersListError && charactersList && (
                    <>
                        {charactersList.length === 0 ? (
                            <p className="m-0 text-muted text-sm">No characters.</p>
                        ) : (
                            charactersList.map((c) => (
                                <button
                                    key={c.id}
                                    type="button"
                                    className={`text-left px-2 py-1.5 rounded text-sm truncate ${
                                        selectedCharacterId === c.id ? 'bg-primary/20 text-primary' : 'text-white hover:bg-border-custom'
                                    }`}
                                    onClick={() => setSelectedCharacterId(c.id)}
                                >
                                    {c.name ?? c.id}
                                </button>
                            ))
                        )}
                    </>
                )}
            </div>

            <div className="flex-1 min-w-0 overflow-auto">
                {!selectedCharacterId && <p className="m-0 text-muted text-sm">Select a character.</p>}
                {selectedCharacterId && characterDetailLoading && <p className="m-0 text-muted text-sm">Loading...</p>}
                {selectedCharacterId && characterDetailError && <p className="m-0 text-red-400 text-sm">{characterDetailError}</p>}
                {selectedCharacterId && !characterDetailLoading && !characterDetailError && characterDetail && (
                    <DebugJsonBlock value={characterDetail} emptyText="No character detail." />
                )}
            </div>
        </div>
    );
}

