/**
 * Game screen - shown when inside a lobby
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

const MOBILE_BREAKPOINT = 768;

function useIsMobileOrTablet(): boolean {
    const [isMobileOrTablet, setIsMobileOrTablet] = useState(() =>
        typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches : false
    );
    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const handler = () => setIsMobileOrTablet(mql.matches);
        mql.addEventListener('change', handler);
        return () => mql.removeEventListener('change', handler);
    }, []);
    return isMobileOrTablet;
}

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
    const isMobileOrTablet = useIsMobileOrTablet();
    const [chatPanelOpen, setChatPanelOpen] = useState(false);
    const [lastSeenMessageCount, setLastSeenMessageCount] = useState(0);

    const unreadCount = isMobileOrTablet && !chatPanelOpen
        ? Math.max(0, chatMessages.length - lastSeenMessageCount)
        : 0;

    const openChat = useCallback(() => {
        setChatPanelOpen(true);
        setLastSeenMessageCount(chatMessages.length);
    }, [chatMessages.length]);

    const closeChat = useCallback(() => setChatPanelOpen(false), []);

    useEffect(() => {
        if (chatPanelOpen) {
            setLastSeenMessageCount(chatMessages.length);
        }
    }, [chatPanelOpen, chatMessages.length]);

    const wasMobileOrTablet = useRef(isMobileOrTablet);
    useEffect(() => {
        if (isMobileOrTablet && !wasMobileOrTablet.current) {
            setChatPanelOpen(false);
        }
        wasMobileOrTablet.current = isMobileOrTablet;
    }, [isMobileOrTablet]);

    const chatTopContent = account ? (
        <div className="flex flex-wrap items-center gap-2">
            <ResourceDisplay resources={account} />
        </div>
    ) : null;

    const chatHeaderLeaveButton = (
        <button
            type="button"
            className="px-4 py-2 bg-danger text-white font-semibold text-sm rounded hover:bg-danger-hover transition-colors shrink-0"
            onClick={onLeave}
        >
            Leave
        </button>
    );

    return (
        <div className="flex h-screen max-md:flex-col">
            {/* Main Game Area */}
            <div className="flex-1 flex flex-col p-4 min-w-0">
                {/* Header - responsive: no overlap; on mobile resources + leave move to chat */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 bg-surface rounded mb-4">
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                        <span className="truncate">{player.name}</span>
                        {isHost && (
                            <span className="px-2 py-1 bg-warning text-secondary rounded text-xs font-bold shrink-0">
                                HOST
                            </span>
                        )}
                    </div>
                    <div className="flex-shrink-0 flex items-center justify-center min-w-0 max-w-[50%] sm:max-w-none">
                        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                            <span className="text-lg sm:text-xl font-semibold truncate">{lobby.name}</span>
                            <span className="px-2 py-1 bg-surface-light rounded font-mono text-xs sm:text-sm shrink-0 hidden sm:inline">
                                {lobby.id}
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 flex justify-end items-center gap-2 sm:gap-3 min-w-0">
                        {isMobileOrTablet && (
                            <button
                                type="button"
                                onClick={openChat}
                                className="relative p-2 rounded bg-surface-light hover:bg-surface-light/80 transition-colors shrink-0"
                                aria-label="Open chat"
                            >
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-danger px-1.5 text-xs font-bold text-white">
                                        {unreadCount > 99 ? '99+' : unreadCount}
                                    </span>
                                )}
                            </button>
                        )}
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

            {/* Chat Sidebar (desktop) / Slide-over (tablet & mobile) */}
            {isMobileOrTablet ? (
                <>
                    {chatPanelOpen && (
                        <div
                            className="fixed inset-0 z-40 bg-black/50 md:bg-transparent"
                            aria-hidden
                            onClick={closeChat}
                        />
                    )}
                    <div
                        className={`
                            fixed top-0 right-0 z-50 h-full w-full max-w-sm flex flex-col bg-surface border-l border-border-custom
                            shadow-lg transition-transform duration-300 ease-out
                            ${chatPanelOpen ? 'translate-x-0' : 'translate-x-full'}
                        `}
                    >
                        <Chat
                            messages={chatMessages}
                            connectionStatus={connectionStatus}
                            enabled={chatEnabled}
                            onSend={onSendChat}
                            isSlideOver
                            onClose={closeChat}
                            topContent={chatTopContent}
                            headerRightContent={chatHeaderLeaveButton}
                        />
                    </div>
                </>
            ) : (
                <Chat
                    messages={chatMessages}
                    connectionStatus={connectionStatus}
                    enabled={chatEnabled}
                    onSend={onSendChat}
                    topContent={chatTopContent}
                    headerRightContent={chatHeaderLeaveButton}
                />
            )}
        </div>
    );
}
