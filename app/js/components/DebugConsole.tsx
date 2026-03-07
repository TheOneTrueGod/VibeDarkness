/**
 * Debug console - press tilde (~) three times to enable, once to disable.
 * Shows game state JSON, player account JSON, and characters in a collapsible panel.
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { GameStatePayload } from '../types';
import type { CampaignCharacterPayload } from '../LobbyClient';

type TabId = 'game-state' | 'player-data' | 'characters';

interface DebugConsoleProps {
    gameState: GameStatePayload | null;
    playerName: string | null;
    fetchPlayerData: () => Promise<Record<string, unknown> | null>;
    fetchCharactersList: () => Promise<CampaignCharacterPayload[]>;
    getCharacter: (characterId: string) => Promise<CampaignCharacterPayload>;
}

export default function DebugConsole({
    gameState,
    playerName,
    fetchPlayerData,
    fetchCharactersList,
    getCharacter,
}: DebugConsoleProps) {
    const [debugMode, setDebugMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [tildeCount, setTildeCount] = useState(0);
    const [activeTab, setActiveTab] = useState<TabId>('game-state');
    const [playerData, setPlayerData] = useState<Record<string, unknown> | null>(null);
    const [playerDataLoading, setPlayerDataLoading] = useState(false);
    const [playerDataError, setPlayerDataError] = useState<string | null>(null);

    const [charactersList, setCharactersList] = useState<CampaignCharacterPayload[] | null>(null);
    const [charactersListLoading, setCharactersListLoading] = useState(false);
    const [charactersListError, setCharactersListError] = useState<string | null>(null);
    const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
    const [characterDetail, setCharacterDetail] = useState<CampaignCharacterPayload | null>(null);
    const [characterDetailLoading, setCharacterDetailLoading] = useState(false);
    const [characterDetailError, setCharacterDetailError] = useState<string | null>(null);

    const onKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key !== '`' && e.key !== '~') return;
            if (debugMode) {
                setDebugMode(false);
                setTildeCount(0);
            } else {
                setTildeCount((prev) => {
                    const next = prev + 1;
                    if (next >= 3) {
                        setDebugMode(true);
                        return 0;
                    }
                    return next;
                });
            }
        },
        [debugMode]
    );

    useEffect(() => {
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onKeyDown]);

    const loadPlayerData = useCallback(async () => {
        setPlayerDataLoading(true);
        setPlayerDataError(null);
        try {
            const data = await fetchPlayerData();
            setPlayerData(data ?? null);
        } catch (err) {
            setPlayerDataError(err instanceof Error ? err.message : 'Failed to load');
            setPlayerData(null);
        } finally {
            setPlayerDataLoading(false);
        }
    }, [fetchPlayerData]);

    useEffect(() => {
        if (activeTab === 'player-data' && playerData === null && !playerDataLoading && !playerDataError) {
            loadPlayerData();
        }
    }, [activeTab, playerData, playerDataLoading, playerDataError, loadPlayerData]);

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
        }
    }, [fetchCharactersList]);

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
        [getCharacter]
    );

    useEffect(() => {
        if (activeTab === 'characters' && charactersList === null && !charactersListLoading && !charactersListError) {
            loadCharactersList();
        }
    }, [activeTab, charactersList, charactersListLoading, charactersListError, loadCharactersList]);

    useEffect(() => {
        if (selectedCharacterId && activeTab === 'characters') {
            loadCharacterDetail(selectedCharacterId);
        } else {
            setCharacterDetail(null);
            setCharacterDetailError(null);
        }
    }, [selectedCharacterId, activeTab, loadCharacterDetail]);

    const tabLabel = playerName ? `${playerName} Data` : 'Player Data';
    const charactersTabGrayed = charactersList === null && !charactersListLoading;

    if (!debugMode) return null;

    return (
        <div
            className={`fixed bottom-0 left-1/2 -translate-x-1/2 z-[9999] bg-surface/[0.92] backdrop-blur border border-border-custom rounded-t-lg shadow flex flex-col overflow-hidden transition-all duration-200 ${
                expanded ? 'w-[50vw] h-[50vh]' : 'w-auto h-auto max-h-[60px]'
            }`}
        >
            <div className="p-2 shrink-0">
                <button
                    className="px-4 py-2 text-sm bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom transition-colors"
                    onClick={() => setExpanded(!expanded)}
                >
                    Debug
                </button>
            </div>
            {expanded && (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex gap-1 px-2 border-b border-border-custom shrink-0">
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                activeTab === 'game-state'
                                    ? 'border-b-primary text-primary'
                                    : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('game-state')}
                        >
                            Game State
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                activeTab === 'player-data'
                                    ? 'border-b-primary text-primary'
                                    : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('player-data')}
                        >
                            {tabLabel}
                        </button>
                        <button
                            type="button"
                            className={`px-3 py-2 bg-transparent border-none border-b-2 text-sm cursor-pointer ${
                                charactersTabGrayed && activeTab !== 'characters'
                                    ? 'border-b-transparent text-muted opacity-60'
                                    : activeTab === 'characters'
                                      ? 'border-b-primary text-primary'
                                      : 'border-b-transparent text-muted hover:text-white'
                            }`}
                            onClick={() => setActiveTab('characters')}
                            title={charactersTabGrayed ? 'Opens tab and loads characters from /api/account/characters' : undefined}
                        >
                            Characters
                        </button>
                    </div>
                    <div className="flex-1 overflow-auto p-3 min-h-0">
                        {activeTab === 'game-state' && (
                            <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                <code>
                                    {gameState
                                        ? JSON.stringify(gameState, null, 2)
                                        : 'No game state yet.'}
                                </code>
                            </pre>
                        )}
                        {activeTab === 'player-data' && (
                            <>
                                {playerDataLoading && (
                                    <p className="m-0 text-muted text-sm">Loading...</p>
                                )}
                                {playerDataError && (
                                    <p className="m-0 text-red-400 text-sm">{playerDataError}</p>
                                )}
                                {!playerDataLoading && !playerDataError && (
                                    <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                        <code>
                                            {playerData !== null
                                                ? JSON.stringify(playerData, null, 2)
                                                : 'No player data.'}
                                        </code>
                                    </pre>
                                )}
                            </>
                        )}
                        {activeTab === 'characters' && (
                            <div className="flex flex-1 min-h-0 gap-3">
                                <div className="flex flex-col shrink-0 w-40 border-r border-border-custom pr-2">
                                    {charactersListLoading && (
                                        <p className="m-0 text-muted text-sm">Loading list...</p>
                                    )}
                                    {charactersListError && (
                                        <p className="m-0 text-red-400 text-sm">{charactersListError}</p>
                                    )}
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
                                                            selectedCharacterId === c.id
                                                                ? 'bg-primary/20 text-primary'
                                                                : 'text-white hover:bg-border-custom'
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
                                    {!selectedCharacterId && (
                                        <p className="m-0 text-muted text-sm">Select a character.</p>
                                    )}
                                    {selectedCharacterId && characterDetailLoading && (
                                        <p className="m-0 text-muted text-sm">Loading...</p>
                                    )}
                                    {selectedCharacterId && characterDetailError && (
                                        <p className="m-0 text-red-400 text-sm">{characterDetailError}</p>
                                    )}
                                    {selectedCharacterId && !characterDetailLoading && !characterDetailError && characterDetail && (
                                        <pre className="m-0 font-mono text-xs leading-relaxed text-white whitespace-pre-wrap break-all">
                                            <code>{JSON.stringify(characterDetail, null, 2)}</code>
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
