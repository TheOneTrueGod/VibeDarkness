import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PlayerState, GameSidebarInfo } from '../../../../../types';
import type { BattleSession } from '../../../game/BattleSession';

export function useBattleSidebarPolling(
    roundNumber: number,
    players: Record<string, PlayerState>,
    characterSelections: Record<string, string>,
    sessionRef: RefObject<BattleSession | null>,
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void,
): void {
    const onSidebarInfoChangeRef = useRef(onSidebarInfoChange);
    onSidebarInfoChangeRef.current = onSidebarInfoChange;

    useEffect(() => {
        const update = () => {
            const engine = sessionRef.current?.getEngine();
            if (!engine || !onSidebarInfoChangeRef.current) return;

            onSidebarInfoChangeRef.current({
                objectives: engine.getBattleObjectiveRows(),
            });
        };

        update();
        const interval = setInterval(update, 500);
        return () => clearInterval(interval);
    }, [roundNumber, sessionRef]);

    useEffect(() => {
        return () => {
            onSidebarInfoChangeRef.current?.(null);
        };
    }, []);

    useEffect(() => {
        sessionRef.current?.updateLobbyContext(players, characterSelections);
    }, [players, characterSelections, sessionRef]);
}
