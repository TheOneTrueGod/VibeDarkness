import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import type { LobbyClient } from '../../../LobbyClient';
import DebugJsonBlock from '../DebugJsonBlock';
import DebugHeartbeatSyncPanel from './DebugHeartbeatSyncPanel';

interface DebugGameStateTabProps {
    isActive: boolean;
    gameState: GameStatePayload | null;
    inBattle?: boolean;
    /** When set with a game id, enables BattleNet heartbeat / sync snapshot on this tab. */
    battleOrdersDebug?: {
        lobbyClient: LobbyClient;
        lobbyId: string;
        gameId: string | null;
        playerId: string;
    } | null;
}

type DebugWindow = {
    __minionBattlesDebugGameTick?: number;
    __minionBattlesDebugSynchash?: string;
    __minionBattlesDebugLogLocalStateToLobby?: () => Promise<void>;
};

export default function DebugGameStateTab({
    isActive,
    gameState,
    inBattle = false,
    battleOrdersDebug = null,
}: DebugGameStateTabProps) {
    const [liveGameTick, setLiveGameTick] = useState<number | null>(null);
    const [liveSynchash, setLiveSynchash] = useState<string | null>(null);
    const [syncBridge, setSyncBridge] = useState<Record<string, unknown> | null>(null);
    const [copyDone, setCopyDone] = useState(false);
    const [logLocalBusy, setLogLocalBusy] = useState(false);
    const [logLocalDone, setLogLocalDone] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        const id = window.setInterval(() => {
            const w = window as unknown as DebugWindow & {
                __minionBattlesSyncDebug?: Record<string, unknown>;
            };
            const tick = w.__minionBattlesDebugGameTick;
            setLiveGameTick(typeof tick === 'number' ? tick : null);
            const h = w.__minionBattlesDebugSynchash;
            setLiveSynchash(typeof h === 'string' && h.length > 0 ? h : null);
            if (inBattle && battleOrdersDebug != null && battleOrdersDebug.gameId != null) {
                setSyncBridge(w.__minionBattlesSyncDebug ?? null);
            } else {
                setSyncBridge(null);
            }
        }, 100);
        return () => window.clearInterval(id);
    }, [isActive, inBattle, battleOrdersDebug]);

    const game = gameState?.game as Record<string, unknown> | undefined;
    const stateTick = game != null ? (game.gameTick ?? game.game_tick) : undefined;
    /** Live engine tick when in battle; lobby payload tick often lags between checkpoints. */
    const gameTick = liveGameTick ?? (typeof stateTick === 'number' ? stateTick : undefined);

    /** Prefer live engine hash in battle; otherwise `game.synchash` from synced payload. */
    const syncHashForDisplay =
        liveSynchash ??
        (game != null && typeof game.synchash === 'string' && game.synchash.length > 0 ? game.synchash : null);

    /** JSON copy uses live tick/synchash from window when present. */
    const displayGameState = useMemo((): GameStatePayload | null => {
        if (!gameState) return null;
        if (game == null) return gameState;
        const tickOk = typeof gameTick === 'number';
        const needMerge = tickOk || syncHashForDisplay != null;
        if (!needMerge) return gameState;
        const mergedGame: Record<string, unknown> = { ...game };
        if (tickOk) {
            mergedGame.gameTick = gameTick;
            mergedGame.game_tick = gameTick;
        }
        if (syncHashForDisplay != null) {
            mergedGame.synchash = syncHashForDisplay;
        }
        return { ...gameState, game: mergedGame as GameStatePayload['game'] };
    }, [game, gameState, gameTick, syncHashForDisplay]);

    const copyGameState = useCallback(async () => {
        if (displayGameState == null) return;
        const text = JSON.stringify(displayGameState, null, 2);
        try {
            await navigator.clipboard.writeText(text);
            setCopyDone(true);
            window.setTimeout(() => setCopyDone(false), 1500);
        } catch {
            // ignore
        }
    }, [displayGameState]);

    const canLogLocalBattle =
        inBattle && battleOrdersDebug != null && battleOrdersDebug.gameId != null;

    const logLocalStateToLobby = useCallback(async () => {
        if (!canLogLocalBattle) return;
        const w = window as unknown as DebugWindow;
        const fn = w.__minionBattlesDebugLogLocalStateToLobby;
        if (!fn) return;
        setLogLocalBusy(true);
        try {
            await fn();
            setLogLocalDone(true);
            window.setTimeout(() => setLogLocalDone(false), 1500);
        } finally {
            setLogLocalBusy(false);
        }
    }, [canLogLocalBattle]);

    if (!isActive) return null;

    const utilityBtnClass =
        'px-2 py-1 text-xs bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom transition-colors disabled:opacity-40';

    return (
        <div className="flex flex-col gap-2">
            <div
                className="flex flex-wrap items-center gap-2 shrink-0 pb-1 border-b border-border-custom/60"
                role="group"
                aria-label="Game state utilities"
            >
                {canLogLocalBattle && (
                    <button
                        type="button"
                        title="Logs live engine JSON to lobby_log (critical) and POSTs snapshot if host"
                        className={utilityBtnClass}
                        disabled={logLocalBusy}
                        onClick={() => void logLocalStateToLobby()}
                    >
                        {logLocalDone ? 'Logged' : logLocalBusy ? '…' : 'Log local state'}
                    </button>
                )}
                <button
                    type="button"
                    className={utilityBtnClass}
                    disabled={displayGameState == null}
                    onClick={() => void copyGameState()}
                >
                    {copyDone ? 'Copied' : 'Copy'}
                </button>
            </div>
            <DebugHeartbeatSyncPanel
                isActive={isActive}
                inBattle={inBattle}
                battleOrdersDebug={battleOrdersDebug}
                syncBridge={syncBridge}
            />
            <DebugJsonBlock value={displayGameState} emptyText="No game state yet." />
        </div>
    );
}
