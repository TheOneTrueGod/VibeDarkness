import { useEffect, useState } from 'react';
import type { GameStatePayload } from '../../../types';
import DebugJsonBlock from '../DebugJsonBlock';

interface DebugGameStateTabProps {
    isActive: boolean;
    gameState: GameStatePayload | null;
}

export default function DebugGameStateTab({ isActive, gameState }: DebugGameStateTabProps) {
    const [liveGameTick, setLiveGameTick] = useState<number | null>(null);

    useEffect(() => {
        if (!isActive) return;
        const id = window.setInterval(() => {
            const tick = (window as unknown as { __minionBattlesDebugGameTick?: number }).__minionBattlesDebugGameTick;
            setLiveGameTick(typeof tick === 'number' ? tick : null);
        }, 100);
        return () => window.clearInterval(id);
    }, [isActive]);

    if (!isActive) return null;

    const game = gameState?.game as Record<string, unknown> | undefined;
    const stateTick = game != null ? (game.gameTick ?? game.game_tick) : undefined;
    const gameTick = liveGameTick ?? (typeof stateTick === 'number' ? stateTick : undefined);
    const tickDisplay = typeof gameTick === 'number' ? String(gameTick) : '-';

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs w-fit">
                <span className="text-muted">gameTick</span>
                <span className="text-white">{tickDisplay}</span>
            </div>
            <DebugJsonBlock value={gameState} emptyText="No game state yet." />
        </div>
    );
}

