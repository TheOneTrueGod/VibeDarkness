/**
 * Game screen - shown when inside a lobby
 */
import React, { useState, useEffect, useCallback } from 'react';
import Chat from './Chat';
import type { MessageEntry } from './Chat';
import PlayerList from './PlayerList';
import GameCanvas from './GameCanvas';
import type { ClickData } from './GameCanvas';
import ResourceDisplay from './ResourceDisplay';
import GameList from './GameList';
import type { PlayerState, AccountState, LobbyState } from '../types';
import { LobbyClient } from '../LobbyClient';
import { getGameById } from '../games/list';

/** Props for game components loaded dynamically */
export interface GameComponentProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
}

interface GameScreenProps {
    lobbyClient: LobbyClient;
    lobby: LobbyState;
    player: PlayerState;
    account: AccountState | null;
    players: Record<string, PlayerState>;
    chatMessages: MessageEntry[];
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    chatEnabled: boolean;
    clicks: Record<string, ClickData>;
    lobbyPageState: 'home' | 'in_game';
    lobbyGameType: string | null;
    lobbyGameId: string | null;
    lobbyGameData: Record<string, unknown> | null;
    onSendChat: (message: string) => void;
    onCanvasClick: (x: number, y: number) => void;
    onLeave: () => void;
    onSelectGame: (gameId: string) => void;
}

export default function GameScreen({
    lobbyClient,
    lobby,
    player,
    account,
    players,
    chatMessages,
    connectionStatus,
    chatEnabled,
    clicks,
    lobbyPageState,
    lobbyGameType,
    lobbyGameId,
    lobbyGameData,
    onSendChat,
    onCanvasClick,
    onLeave,
    onSelectGame,
}: GameScreenProps) {
    const [GameComp, setGameComp] = useState<React.ComponentType<GameComponentProps> | null>(null);
    const [gameLoadError, setGameLoadError] = useState<string | null>(null);

    // Load game component dynamically when game type changes
    useEffect(() => {
        if (lobbyPageState !== 'in_game' || !lobbyGameType) {
            setGameComp(null);
            setGameLoadError(null);
            return;
        }

        const game = getGameById(lobbyGameType);
        if (!game) {
            setGameLoadError('Unknown game type');
            return;
        }

        let cancelled = false;
        setGameLoadError(null);

        import(`../games/${lobbyGameType}/Game.tsx`)
            .then((mod) => {
                if (!cancelled) {
                    setGameComp(() => mod.default);
                }
            })
            .catch((err) => {
                console.error('Failed to load game:', err);
                if (!cancelled) {
                    setGameLoadError(`Failed to load game: ${game.title}`);
                }
            });

        return () => {
            cancelled = true;
        };
    }, [lobbyPageState, lobbyGameType]);

    const isHost = player.isHost ?? false;

    return (
        <div className="flex h-screen max-md:flex-col">
            {/* Main Game Area */}
            <div className="flex-1 flex flex-col p-4">
                {/* Header */}
                <div className="flex items-center px-4 py-3 bg-surface rounded mb-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span>{player.name}</span>
                            {isHost && (
                                <span className="px-2 py-1 bg-warning text-secondary rounded text-xs font-bold">
                                    HOST
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex-shrink-0 flex justify-center">
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-semibold">{lobby.name}</span>
                            <span className="px-2 py-1 bg-surface-light rounded font-mono text-sm">
                                {lobby.id}
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 flex justify-end items-center gap-3 min-w-0">
                        {account && <ResourceDisplay resources={account} />}
                        <button
                            className="px-4 py-2 bg-danger text-white font-semibold text-sm rounded hover:bg-danger-hover transition-colors"
                            onClick={onLeave}
                        >
                            Leave
                        </button>
                    </div>
                </div>

                {/* Central area */}
                <div className="flex-1 relative flex flex-col min-h-0">
                    {lobbyPageState === 'home' && (
                        <GameList isHost={isHost} onSelectGame={onSelectGame} />
                    )}
                    {lobbyPageState === 'in_game' && lobbyGameType && (
                        <div className="flex-1 relative flex items-center justify-center bg-surface rounded-lg overflow-hidden min-h-0">
                            {gameLoadError ? (
                                <p className="p-5 text-danger">{gameLoadError}</p>
                            ) : GameComp ? (
                                <GameComp
                                    lobbyClient={lobbyClient}
                                    lobbyId={lobby.id}
                                    gameId={lobbyGameId ?? ''}
                                    playerId={player.id}
                                    isHost={isHost}
                                    players={players}
                                    gameData={lobbyGameData}
                                />
                            ) : (
                                <p className="text-muted">Loading game...</p>
                            )}
                        </div>
                    )}
                    {lobbyPageState === 'home' && (
                        <GameCanvas clicks={clicks} onCanvasClick={onCanvasClick} />
                    )}
                </div>

                {/* Player List */}
                <PlayerList players={players} currentPlayerId={player.id} />
            </div>

            {/* Chat Sidebar */}
            <Chat
                messages={chatMessages}
                connectionStatus={connectionStatus}
                enabled={chatEnabled}
                onSend={onSendChat}
            />
        </div>
    );
}
