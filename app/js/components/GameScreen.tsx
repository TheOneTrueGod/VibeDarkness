/**
 * Game screen - shown when inside a lobby
 */
import React, { useState, useEffect, useCallback, useRef, useMemo, useSyncExternalStore } from 'react';
import Chat from './Chat';
import LobbyIdBadge from './LobbyIdBadge';
import type { MessageEntry } from './Chat';
import PlayerList from './PlayerList';
import GameCanvas from './GameCanvas';
import type { ClickData } from './GameCanvas';
import GameList from './GameList';
import type { PlayerState, AccountState, LobbyState, GameSidebarInfo } from '../types';
import ObjectivePanel from '../games/minion_battles/ui/components/ObjectivePanel';
import SidebarBattleSyncDebugCard from '../games/minion_battles/ui/components/SidebarBattleSyncDebugCard';
import { getAlwaysShowSyncStatus, subscribeAlwaysShowSyncStatus } from '../debugFlags';
import { LobbyClient } from '../LobbyClient';
import { getGameById } from '../games/list';
import { useGameSyncOptional } from '../contexts/GameSyncContext';
import { useCurrentUser } from '../user/useCurrentUser';
import { useToast } from '../contexts/ToastContext';
import { MinionBattlesApi } from '../games/minion_battles/api/minionBattlesApi';
import {
    BattleActionRowProvider,
    BattleActionRowSlot,
} from '../contexts/BattleActionRowContext';

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
    /** When set (Minion Battles), the game should prefer this over constructing its own facade. */
    minionBattlesApi?: MinionBattlesApi;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<import('../types').CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[],
        researchRewardIds?: string[],
        researchRewards?: import('../types').MissionResearchRewardEntry[]
    ) => Promise<void>;
    /** Called when user leaves (e.g. from defeat modal). */
    onLeave?: () => void;
    /** Called when the player presses Continue after a victory; passes the campaign character id they
     *  brought (undefined for spectators/control-enemies). Falls back to onLeave if not provided. */
    onContinue?: (characterId: string | undefined) => void;
    /** Called when user clicks Try Again after defeat or Continue after victory; creates a new lobby for the given
     *  mission. Returns true on success so the caller can fall back if lobby creation fails. */
    onTryAgain?: (missionId: string, previousCharacterSelections: Record<string, string>) => Promise<boolean>;
    /** Client-only: join the next lobby that the host created after a victory. */
    onJoinNextLobby?: (nextLobbyId: string) => Promise<void>;
    /** Called when host sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    /** Called when the game is about to enter battle so the lobby UI can switch immediately. */
    onBattleStartStatusChange?: (starting: boolean) => void;
    /** BattleNet desync recovery fullscreen overlay (distinct from GameSyncContext lobby poll). */
    onBattleNetResyncingChange?: (resyncing: boolean) => void;
    /** Active campaign context used by campaign mission UX. */
    currentCampaignId?: string | null;
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
    currentCampaignId?: string | null;
    onSendChat: (message: string) => void;
    onCanvasClick: (x: number, y: number) => void;
    onLeave: () => void;
    onContinue?: (characterId: string | undefined) => void;
    onSelectGame: (gameId: string) => void;
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<import('../types').CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[],
        researchRewardIds?: string[],
        researchRewards?: import('../types').MissionResearchRewardEntry[]
    ) => Promise<void>;
    /** Create a new lobby for the given mission and navigate to it (e.g. Try Again after defeat). */
    onTryAgain?: (missionId: string, previousCharacterSelections: Record<string, string>) => Promise<boolean>;
    /** Client-only: join the next lobby that the host created after a victory. */
    onJoinNextLobby?: (nextLobbyId: string) => Promise<void>;
    /** Called when the game sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    /** Sends a WebRTC ping event to other players. */
    onPing?: () => void;
    /** Whether the Ping button should be enabled (e.g. only when WebRTC is ready). */
    pingEnabled?: boolean;
    /** Player IDs whose cards should currently flash (e.g. WebRTC ping highlight). */
    flashingPlayerIds?: string[];
    /** Map of playerId → whether their WebRTC peer connection is currently open. */
    webRtcPeerConnected?: Record<string, boolean>;
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
    currentCampaignId = null,
    onSendChat,
    onCanvasClick,
    onLeave,
    onContinue,
    onSelectGame,
    onRecordMissionResult,
    onTryAgain,
    onJoinNextLobby,
    onEmittedChatMessage,
    onPing,
    pingEnabled = true,
    flashingPlayerIds,
    webRtcPeerConnected,
}: GameScreenProps) {
    const { isAdmin } = useCurrentUser();
    const { showToast } = useToast();
    const gameSync = useGameSyncOptional();
    const [GameComp, setGameComp] = useState<React.ComponentType<GameComponentProps> | null>(null);
    const [gameLoadError, setGameLoadError] = useState<string | null>(null);
    const [gameSidebarInfo, setGameSidebarInfo] = useState<GameSidebarInfo | null>(null);
    const [battlePlayerListHidden, setBattlePlayerListHidden] = useState(false);
    const [adminRestartLoading, setAdminRestartLoading] = useState(false);

    const effectiveLobbyPageState = gameSync?.gameState?.lobbyState ?? lobbyPageState;
    const effectiveLobbyGameId = gameSync?.gameState?.gameId ?? lobbyGameId;
    const effectiveLobbyGameType = gameSync?.gameState?.gameType ?? lobbyGameType;
    const effectiveLobbyGameData = gameSync?.gameState?.game ?? lobbyGameData;
    const basePlayers: Record<string, PlayerState> = gameSync?.gameState?.players
        ? Object.fromEntries(Object.entries(gameSync.gameState.players).map(([k, p]) => [k, p as PlayerState]))
        : players;
    const effectivePlayers = useMemo(() => {
        if (!webRtcPeerConnected || Object.keys(webRtcPeerConnected).length === 0) return basePlayers;
        return Object.fromEntries(
            Object.entries(basePlayers).map(([id, p]) => {
                const connected = webRtcPeerConnected[id];
                if (id === player.id || connected === undefined) return [id, p];
                return [id, { ...p, isConnected: connected }];
            })
        );
    }, [basePlayers, webRtcPeerConnected, player.id]);

    const minionBattlesApi = useMemo((): MinionBattlesApi | undefined => {
        if (effectiveLobbyGameType !== 'minion_battles') return undefined;
        return new MinionBattlesApi(lobbyClient, lobby.id, effectiveLobbyGameId ?? '', player.id);
    }, [effectiveLobbyGameType, lobbyClient, lobby.id, effectiveLobbyGameId, player.id]);

    const [battleNetResyncing, setBattleNetResyncing] = useState(false);

    const isLoading = gameSync?.syncStatus === 'loading';
    const isResyncing = gameSync?.syncStatus === 'resyncing';

    // Only show resyncing overlay during battle; pre-battle phases use GameSyncContext's unified
    // poll loop (full state on a phase-based cadence) and don't need to block the whole screen
    const gamePhase = effectiveLobbyGameData?.gamePhase ?? effectiveLobbyGameData?.game_phase;
    const inBattle = gamePhase === 'battle';
    const alwaysShowSyncStatus = useSyncExternalStore(
        subscribeAlwaysShowSyncStatus,
        getAlwaysShowSyncStatus,
        getAlwaysShowSyncStatus,
    );
    const showResyncOverlay = isLoading || (battleNetResyncing && inBattle);
    const showAdminRestartBattle =
        isAdmin &&
        inBattle &&
        effectiveLobbyGameType === 'minion_battles' &&
        !!effectiveLobbyGameId;

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

    const handleAdminRestartBattle = useCallback(async () => {
        if (!effectiveLobbyGameId || adminRestartLoading) return;
        setAdminRestartLoading(true);
        try {
            await lobbyClient.resetBattleToInitialSnapshot(lobby.id, effectiveLobbyGameId, player.id);
            gameSync?.requestResync();
            showToast('Mission combat restarted from mission definition', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Failed to reset battle', 'error');
        } finally {
            setAdminRestartLoading(false);
        }
    }, [
        adminRestartLoading,
        effectiveLobbyGameId,
        gameSync,
        lobby.id,
        lobbyClient,
        player.id,
        showToast,
    ]);

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
        const showSyncDebugCard =
            alwaysShowSyncStatus && inBattle && effectiveLobbyGameType === 'minion_battles';
        if (!gameSidebarInfo && !showSyncDebugCard) return null;

        return (
            <div className="flex flex-col">
                {showSyncDebugCard ? (
                    <div
                        className={
                            gameSidebarInfo != null ? 'border-b border-border-custom pb-2' : undefined
                        }
                    >
                        <SidebarBattleSyncDebugCard />
                    </div>
                ) : null}
                {gameSidebarInfo != null ? (
                    <div className={showSyncDebugCard ? 'pt-2' : undefined}>
                        <ObjectivePanel objectives={gameSidebarInfo.objectives} />
                    </div>
                ) : null}
            </div>
        );
    }, [gameSidebarInfo, alwaysShowSyncStatus, inBattle, effectiveLobbyGameType]);

    const chatHeaderLeaveButton = useMemo(
        () => (
            <div className="flex items-center gap-2">
                {showAdminRestartBattle ? (
                    <button
                        type="button"
                        className="px-3 py-2 bg-warning text-secondary font-semibold text-xs rounded hover:bg-warning/90 transition-colors shrink-0 disabled:opacity-50"
                        onClick={handleAdminRestartBattle}
                        disabled={adminRestartLoading}
                    >
                        {adminRestartLoading ? 'Restarting…' : 'Restart'}
                    </button>
                ) : (
                    <button
                        type="button"
                        className="px-3 py-2 bg-primary text-secondary font-semibold text-xs rounded hover:bg-primary-hover transition-colors shrink-0"
                        onClick={onPing}
                        disabled={!pingEnabled}
                    >
                        Ping
                    </button>
                )}
                <button
                    type="button"
                    className="px-4 py-2 bg-danger text-white font-semibold text-sm rounded hover:bg-danger-hover transition-colors shrink-0"
                    onClick={isHost && inBattle ? () => { window.location.href = '/'; } : onLeave}
                >
                    Leave
                </button>
            </div>
        ),
        [
            adminRestartLoading,
            handleAdminRestartBattle,
            inBattle,
            isHost,
            onLeave,
            onPing,
            pingEnabled,
            showAdminRestartBattle,
        ],
    );

    const shouldHideBattlePlayerList =
        effectiveLobbyPageState === 'in_game' &&
        effectiveLobbyGameType === 'minion_battles' &&
        (battlePlayerListHidden ||
            (effectiveLobbyGameData?.gamePhase ?? effectiveLobbyGameData?.game_phase) === 'battle');

    /** Desktop Minion Battles combat: chat sits above a full-width action row (card hand portals into it). */
    const battleChromeDesktop =
        !isMobileOrTablet &&
        effectiveLobbyPageState === 'in_game' &&
        effectiveLobbyGameType === 'minion_battles' &&
        inBattle;

    const lobbyHeader = useMemo(
        () => (
            <div
                className={`flex flex-wrap items-center gap-2 sm:gap-3 px-2 sm:px-4 py-3 bg-surface rounded ${
                    battleChromeDesktop ? 'mb-0 shrink-0' : 'mb-4'
                }`}
            >
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
        ),
        [
            battleChromeDesktop,
            isHost,
            isMobileOrTablet,
            lobby.id,
            lobby.name,
            openChat,
            player.name,
            unreadCount,
        ],
    );

    const centralSection = useMemo(
        () => (gamePanelRounding: string, overlayRounding: string) => (
            <div className="flex-1 relative flex flex-col min-h-0">
                {isLoading && effectiveLobbyPageState !== 'in_game' && (
                    <div
                        className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-surface"
                        aria-busy="true"
                        aria-live="polite"
                    >
                        <div className="flex flex-col items-center gap-4 px-6 py-6 bg-surface rounded-xl border border-border-custom shadow-xl">
                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            <p className="text-muted">Loading game state...</p>
                        </div>
                    </div>
                )}
                {effectiveLobbyPageState === 'home' && !isLoading && <GameList isHost={isHost} onSelectGame={onSelectGame} />}
                {effectiveLobbyPageState === 'in_game' && effectiveLobbyGameType && (
                    <div
                        className={`flex-1 relative flex items-center justify-center bg-surface overflow-hidden min-h-0 ${gamePanelRounding}`}
                    >
                        {gameLoadError ? (
                            <p className="p-5 text-danger">{gameLoadError}</p>
                        ) : GameComp ? (
                            <>
                                <GameComp
                                    lobbyClient={lobbyClient}
                                    lobbyId={lobby.id}
                                    gameId={effectiveLobbyGameId ?? ''}
                                    minionBattlesApi={minionBattlesApi}
                                    playerId={player.id}
                                    isHost={isHost}

                                    players={effectivePlayers}
                                    gameData={effectiveLobbyGameData}
                                    onSidebarInfoChange={setGameSidebarInfo}
                                    onRecordMissionResult={onRecordMissionResult}
                                    onLeave={onLeave}
                                    onContinue={onContinue}
                                    onTryAgain={onTryAgain}
                                    onJoinNextLobby={onJoinNextLobby}
                                    onEmittedChatMessage={onEmittedChatMessage}
                                    onBattleStartStatusChange={setBattlePlayerListHidden}
                                    onBattleNetResyncingChange={setBattleNetResyncing}
                                    currentCampaignId={currentCampaignId}
                                />
                                {showResyncOverlay && (
                                    <div
                                        className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 ${overlayRounding}`}
                                        style={{ pointerEvents: 'auto' }}
                                        aria-busy="true"
                                        aria-live="polite"
                                    >
                                        <div className="flex flex-col items-center gap-4 px-6 py-6 bg-surface rounded-xl border border-border-custom shadow-xl">
                                            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                                            <p className="text-muted">
                                                {isLoading
                                                    ? 'Loading game state...'
                                                    : battleNetResyncing && !isLoading
                                                      ? 'Resyncing battle…'
                                                      : 'Resyncing...'}
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
                                {showResyncOverlay && (
                                    <div
                                        className={`absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 ${overlayRounding}`}
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
                {effectiveLobbyPageState === 'home' && !isLoading && <GameCanvas clicks={clicks} onCanvasClick={onCanvasClick} />}
            </div>
        ),
        [
            GameComp,
            battleNetResyncing,
            clicks,
            currentCampaignId,
            effectiveLobbyGameData,
            effectiveLobbyGameId,
            effectiveLobbyGameType,
            effectiveLobbyPageState,
            effectivePlayers,
            gameLoadError,
            isHost,
            isLoading,
            lobby.id,
            lobbyClient,
            minionBattlesApi,
            onEmittedChatMessage,
            onJoinNextLobby,
            onLeave,
            onRecordMissionResult,
            onSelectGame,
            onTryAgain,
            onCanvasClick,
            player.id,
            showResyncOverlay,
        ],
    );

    const playerListSection =
        !shouldHideBattlePlayerList ? (
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
        ) : null;

    const chatPanel = (
        <Chat
            messages={chatMessages}
            connectionStatus={connectionStatus}
            enabled={chatEnabled}
            onSend={onSendChat}
            topContent={chatTopContent}
            headerRightContent={chatHeaderLeaveButton}
        />
    );

    if (isMobileOrTablet) {
        return (
            <div className="flex h-screen max-md:flex-col">
                <div className="flex-1 flex flex-col p-4 min-w-0">
                    {lobbyHeader}
                    {centralSection('rounded-lg', 'rounded-lg')}
                    {playerListSection}
                </div>
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
            </div>
        );
    }

    if (battleChromeDesktop) {
        return (
            <BattleActionRowProvider>
                <div className="flex h-screen min-h-0 flex-col">
                    <div className="shrink-0 px-4 pt-4">{lobbyHeader}</div>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 flex-row items-stretch px-4 pb-2">
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                                {centralSection(
                                    'rounded-tl-lg border border-r-0 border-border-custom',
                                    'rounded-tl-lg',
                                )}
                                {playerListSection}
                            </div>
                            <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-tr-lg border border-l-0 border-border-custom">
                                {chatPanel}
                            </div>
                        </div>
                        <BattleActionRowSlot className="min-h-0 w-full shrink-0 border-t border-border-custom bg-surface" />
                    </div>
                </div>
            </BattleActionRowProvider>
        );
    }

    return (
        <div className="flex h-screen max-md:flex-col">
            <div className="flex min-w-0 flex-1 flex-col p-4">
                {lobbyHeader}
                {centralSection('rounded-lg', 'rounded-lg')}
                {playerListSection}
            </div>
            {chatPanel}
        </div>
    );
}
