import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugGameStateTabProps {
    isActive: boolean;
    gameState: GameStatePayload | null;
}

type DebugWindow = {
    __minionBattlesDebugGameTick?: number;
    __minionBattlesDebugSynchash?: string;
};

export default function DebugGameStateTab({ isActive, gameState }: DebugGameStateTabProps) {
    const [liveGameTick, setLiveGameTick] = useState<number | null>(null);
    const [liveSynchash, setLiveSynchash] = useState<string | null>(null);
    const [copyDone, setCopyDone] = useState(false);

    useEffect(() => {
        if (!isActive) return;
        const id = window.setInterval(() => {
            const w = window as unknown as DebugWindow;
            const tick = w.__minionBattlesDebugGameTick;
            setLiveGameTick(typeof tick === 'number' ? tick : null);
            const h = w.__minionBattlesDebugSynchash;
            setLiveSynchash(typeof h === 'string' && h.length > 0 ? h : null);
        }, 100);
        return () => window.clearInterval(id);
    }, [isActive]);

    if (!isActive) return null;

    const game = gameState?.game as Record<string, unknown> | undefined;
    const stateTick = game != null ? (game.gameTick ?? game.game_tick) : undefined;
    /** Live engine tick when in battle; lobby payload tick often lags between checkpoints. */
    const gameTick = liveGameTick ?? (typeof stateTick === 'number' ? stateTick : undefined);
    const tickDisplay = typeof gameTick === 'number' ? String(gameTick) : '-';

    /** Prefer live engine hash in battle; otherwise `game.synchash` from synced payload. */
    const syncHashForDisplay =
        liveSynchash
        ?? (game != null && typeof game.synchash === 'string' && game.synchash.length > 0
            ? game.synchash
            : null);
    const syncHashDisplay = syncHashForDisplay ?? '-';

    /** Shown JSON uses the same tick and synchash as the header so debug output stays consistent. */
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

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs w-full max-w-full">
                <span className="text-muted">gameTick</span>
                <span className="text-white">{tickDisplay}</span>
                <span className="text-muted">SyncHash</span>
                <span className="text-white font-mono text-[10px] break-all leading-tight">{syncHashDisplay}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <button
                    type="button"
                    className="px-2 py-1 text-xs bg-surface-light text-white border border-border-custom rounded hover:bg-border-custom transition-colors disabled:opacity-40"
                    disabled={displayGameState == null}
                    onClick={() => void copyGameState()}
                >
                    {copyDone ? 'Copied' : 'Copy'}
                </button>
            </div>
            <DebugJsonBlock value={displayGameState} emptyText="No game state yet." />
        </div>
    );
}
