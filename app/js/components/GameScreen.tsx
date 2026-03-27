/**
 * Game screen - shown when inside a lobby
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Chat from './Chat';
import LobbyIdBadge from './LobbyIdBadge';
import type { MessageEntry } from './Chat';
import PlayerList from './PlayerList';
import GameCanvas from './GameCanvas';
import type { ClickData } from './GameCanvas';
import ResourceDisplay from './ResourceDisplay';
import GameList from './GameList';
import type { PlayerState, AccountState, LobbyState, GameSidebarInfo } from '../types';
import { LobbyClient } from '../LobbyClient';
import { getGameById } from '../games/list';
import { useGameSyncOptional } from '../contexts/GameSyncContext';

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
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<import('../types').CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[]
    ) => Promise<void>;
    /** Called when user leaves (e.g. from defeat modal). */
    onLeave?: () => void;
    /** Called when user clicks Try Again after defeat; creates a new lobby for the given mission. */
    onTryAgain?: (missionId: string) => Promise<void>;
    /** Called when host sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    /** Called when the game is about to enter battle so the lobby UI can switch immediately. */
    onBattleStartStatusChange?: (starting: boolean) => void;
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
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<import('../types').CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[]
    ) => Promise<void>;
    /** Create a new lobby for the given mission and navigate to it (e.g. Try Again after defeat). */
    onTryAgain?: (missionId: string) => Promise<void>;
    /** Called when the game sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    /** Sends a WebRTC ping event to other players. */
    onPing?: () => void;
    /** Whether the Ping button should be enabled (e.g. only when WebRTC is ready). */
    pingEnabled?: boolean;
    /** Player IDs whose cards should currently flash (e.g. WebRTC ping highlight). */
    flashingPlayerIds?: string[];
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
    onRecordMissionResult,
    onTryAgain,
    onEmittedChatMessage,
    onPing,
    pingEnabled = true,
    flashingPlayerIds,
}: GameScreenProps) {
    const gameSync = useGameSyncOptional();
    const [GameComp, setGameComp] = useState<React.ComponentType<GameComponentProps> | null>(null);
    const [gameLoadError, setGameLoadError] = useState<string | null>(null);
    const [gameSidebarInfo, setGameSidebarInfo] = useState<GameSidebarInfo | null>(null);
    const [battlePlayerListHidden, setBattlePlayerListHidden] = useState(false);

    const effectiveLobbyPageState = gameSync?.gameState?.lobbyState ?? lobbyPageState;
    const effectiveLobbyGameId = gameSync?.gameState?.gameId ?? lobbyGameId;
    const effectiveLobbyGameType = gameSync?.gameState?.gameType ?? lobbyGameType;
    const effectiveLobbyGameData = gameSync?.gameState?.game ?? lobbyGameData;
    const effectivePlayers = gameSync?.gameState?.players
        ? Object.fromEntries(Object.entries(gameSync.gameState.players).map(([k, p]) => [k, p as PlayerState]))
        : players;

    const isLoading = gameSync?.syncStatus === 'loading';
    const isResyncing = gameSync?.syncStatus === 'resyncing';
    const showWaitingForHost = gameSync?.syncStatus === 'waiting_for_host';

    // Only show resyncing overlay during battle; pre-battle phases use GameSyncContext's unified
    // poll loop (full state on a phase-based cadence) and don't need to block the whole screen
    const gamePhase = effectiveLobbyGameData?.gamePhase ?? effectiveLobbyGameData?.game_phase;
    const inBattle = gamePhase === 'battle';
    const showResyncOverlay = isLoading || (isResyncing && inBattle);

    // Load game component dynamically when game type changes
    useEffect(() => {
        if (effectiveLobbyPageState !== 'in_game' || !effectiveLobbyGameType) {
            setGameComp(null);
            setGameLoadError(null);
            setBattlePlayerListHidden(false);
            return;
        }

        const game = getGameById(effectiveLobbyGameType);
        if (!game) {
            setGameLoadError('Unknown game type');
            return;
        }

        let cancelled = false;
        setGameLoadError(null);

        import(`../games/${effectiveLobbyGameType}/Game.tsx`)
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
    }, [effectiveLobbyPageState, effectiveLobbyGameType]);

    useEffect(() => {
        setBattlePlayerListHidden(false);
    }, [effectiveLobbyGameId, effectiveLobbyGameType]);

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

    const chatTopContent = useMemo(() => {
        const hasResources = !!account;
        const hasSidebar = !!gameSidebarInfo;
        if (!hasResources && !hasSidebar) return null;

        return (
            <div className="flex flex-col gap-2">
                {hasResources && (
                    <div className="flex flex-wrap items-center gap-2">
                        <ResourceDisplay resources={account} />
                    </div>
                )}
                {hasSidebar && (
                    <>
                        {/* Turn indicator - always occupies space; invisible when not your turn */}
                        <div
                            className={`text-sm px-3 py-2 rounded-lg bg-green-700 text-white font-medium text-center border border-green-500 ${
                                gameSidebarInfo.turnIndicator.visible ? '' : 'invisible'
                            }`}
                        >
                            {gameSidebarInfo.turnIndicator.text}
                        </div>
                        {/* Player unit health list */}
                        <div className="flex flex-col gap-1.5">
                            {gameSidebarInfo.playerUnits.map((pu) => {
                                const pState = effectivePlayers[pu.playerId];
                                const hpPct = pu.maxHp > 0 ? Math.round((pu.hp / pu.maxHp) * 100) : 0;
                                const barColor = !pu.isAlive
                                    ? 'bg-gray-600'
                                    : hpPct > 60
                                      ? 'bg-green-500'
                                      : hpPct > 30
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500';
                                return (
                                    <div key={pu.playerId} className="flex flex-col gap-0.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span
                                                className="font-medium truncate"
                                                style={{ color: pState?.color ?? '#fff' }}
                                            >
                                                {pu.playerName}
                                            </span>
                                            <span className="text-muted capitalize text-[11px]">
                                                {pu.characterId}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <div className="flex-1 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${barColor}`}
                                                    style={{ width: `${hpPct}%` }}
                                                />
                                            </div>
                                            <span className="text-[10px] text-muted w-12 text-right">
                                                {pu.hp}/{pu.maxHp}
                                            </span>
                                        </div>
                                    </div>
                );
            })}
                        </div>
                    </>
                )}
            </div>
        );
    }, [account, gameSidebarInfo, effectivePlayers]);

    const chatHeaderLeaveButton = (
        <div className="flex items-center gap-2">
            <button
                type="button"
                className="px-3 py-2 bg-primary text-secondary font-semibold text-xs rounded hover:bg-primary-hover transition-colors shrink-0"
                onClick={onPing}
                disabled={!pingEnabled}
            >
                Ping
            </button>
            <button
                type="button"
                className="px-4 py-2 bg-danger text-white font-semibold text-sm rounded hover:bg-danger-hover transition-colors shrink-0"
                onClick={onLeave}
            >
                Leave
            </button>
        </div>
    );

    const shouldHideBattlePlayerList =
        effectiveLobbyPageState === 'in_game' &&
        effectiveLobbyGameType === 'minion_battles' &&
        (battlePlayerListHidden ||
            (effectiveLobbyGameData?.gamePhase ?? effectiveLobbyGameData?.game_phase) === 'battle');

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
                            <LobbyIdBadge id={lobby.id} className="hidden sm:inline" />
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
                    {effectiveLobbyPageState === 'home' && (
                        <GameList isHost={isHost} onSelectGame={onSelectGame} />
                    )}
                    {effectiveLobbyPageState === 'in_game' && effectiveLobbyGameType && (
                        <div className="flex-1 relative flex items-center justify-center bg-surface rounded-lg overflow-hidden min-h-0">
                            {gameLoadError ? (
                                <p className="p-5 text-danger">{gameLoadError}</p>
                            ) : GameComp ? (
                                <>
                                    {showWaitingForHost && (
                                        <div className="absolute left-1/2 bottom-[calc(12rem+80px)] -translate-x-1/2 z-10 flex items-center gap-2 px-3 py-2 bg-surface-light rounded-lg border border-warning text-sm text-warning">
                                            <div className="h-4 w-4 flex-shrink-0 border-2 border-warning border-t-transparent rounded-full animate-spin" />
                                            <div className="flex flex-col items-start gap-0.5 min-w-0">
                                                <span className="font-medium">Waiting for host</span>
                                                {gameSync?.waitingForHostReason ? (
                                                    <span className="text-xs text-warning/80 font-normal leading-snug max-w-[14rem]">
                                                        {gameSync.waitingForHostReason}
                                                    </span>
                                                ) : null}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => gameSync?.requestResync()}
                                                className="ml-1 px-2 py-1 rounded border border-warning bg-warning/10 hover:bg-warning/20 text-warning text-xs font-medium transition-colors"
                                            >
                                                Resync
                                            </button>
                                        </div>
                                    )}
                                    <GameComp
                                        lobbyClient={lobbyClient}
                                        lobbyId={lobby.id}
                                        gameId={effectiveLobbyGameId ?? ''}
                                        playerId={player.id}
                                        isHost={isHost}
                                        isAdmin={account?.role === 'admin'}
                                        players={effectivePlayers}
                                        gameData={effectiveLobbyGameData}
                                        onSidebarInfoChange={setGameSidebarInfo}
                                        onRecordMissionResult={onRecordMissionResult}
                                        onLeave={onLeave}
                                        onTryAgain={onTryAgain}
                                        onEmittedChatMessage={onEmittedChatMessage}
                                        onBattleStartStatusChange={setBattlePlayerListHidden}
                                    />
                                    {/* Loading/resyncing overlay: keeps canvas visible, blocks interaction */}
                                    {showResyncOverlay && (
                                        <div
                                            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 rounded-lg"
                                            style={{ pointerEvents: 'auto' }}
                                            aria-busy="true"
                                            aria-live="polite"
                                        >
                                            <div className="flex flex-col items-center gap-4 px-6 py-6 bg-surface rounded-xl border border-border-custom shadow-xl">
                                                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                                <p className="text-muted">
                                                    {isLoading ? 'Loading game state...' : 'Resyncing...'}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="flex flex-col items-center gap-4 text-muted">
                                        <p>Loading game...</p>
                                    </div>
                                    {/* Overlay during initial load so layout stays stable */}
                                    {showResyncOverlay && (
                                        <div
                                            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 rounded-lg"
                                            style={{ pointerEvents: 'auto' }}
                                            aria-busy="true"
                                        >
                                            <div className="flex flex-col items-center gap-4 px-6 py-6 bg-surface rounded-xl border border-border-custom shadow-xl">
                                                <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                                <p className="text-muted">Loading game state...</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                    {effectiveLobbyPageState === 'home' && (
                        <GameCanvas clicks={clicks} onCanvasClick={onCanvasClick} />
                    )}
                </div>

                {/* Player List (hidden during battle phase in minion_battles) */}
                {!shouldHideBattlePlayerList && (
                    <PlayerList
                        players={effectivePlayers}
                        currentPlayerId={player.id}
                        characterSelections={
                            effectiveLobbyGameData != null
                                ? (effectiveLobbyGameData.characterSelections as Record<string, string>) ??
                                  (effectiveLobbyGameData.character_selections as Record<string, string>)
                                : undefined
                        }
                        readyPlayerIds={
                            effectiveLobbyGameData != null &&
                            (effectiveLobbyGameData.gamePhase ?? effectiveLobbyGameData.game_phase) === 'character_select'
                                ? ((effectiveLobbyGameData.characterSelectReadyPlayerIds ??
                                      effectiveLobbyGameData.character_select_ready_player_ids) as string[] | undefined) ?? []
                                : undefined
                        }
                        flashingPlayerIds={flashingPlayerIds}
                    />
                )}
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
