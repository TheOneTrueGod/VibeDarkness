/**
 * Debug console - press tilde (~) three times to enable, once to disable.
 * Shows game state JSON and player account JSON in a collapsible panel.
 */
import React, { useState, useEffect, useCallback } from 'react';
import type { GameStatePayload } from '../types';

type TabId = 'game-state' | 'player-data';

interface DebugConsoleProps {
    gameState: GameStatePayload | null;
    playerName: string | null;
    fetchPlayerData: () => Promise<Record<string, unknown> | null>;
}

export default function DebugConsole({ gameState, playerName, fetchPlayerData }: DebugConsoleProps) {
    const [debugMode, setDebugMode] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [tildeCount, setTildeCount] = useState(0);
    const [activeTab, setActiveTab] = useState<TabId>('game-state');
    const [playerData, setPlayerData] = useState<Record<string, unknown> | null>(null);
    const [playerDataLoading, setPlayerDataLoading] = useState(false);
    const [playerDataError, setPlayerDataError] = useState<string | null>(null);

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

    const tabLabel = playerName ? `${playerName} Data` : 'Player Data';

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
                    </div>
                </div>
            )}
        </div>
    );
}
