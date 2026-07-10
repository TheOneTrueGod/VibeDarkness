import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { PlayerState } from '../../../../../types';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import type { BattleSession } from '../../../game/BattleSession';
import { logToLobbyLog } from '../../../../../lobbyLog';

export function useLobbyHostChangeLog(
    players: Record<string, PlayerState>,
    api: MinionBattlesApi,
    playerId: string,
    sessionRef: RefObject<BattleSession | null>,
): void {
    const prevLobbyHostPlayerIdRef = useRef<string | null>(null);

    useEffect(() => {
        const hostEntry = Object.entries(players).find(([, p]) => p.isHost);
        const nextHostId = hostEntry?.[0] ?? null;
        const prev = prevLobbyHostPlayerIdRef.current;
        if (prev !== null && nextHostId !== null && prev !== nextHostId) {
            const eng = sessionRef.current?.getEngine();
            logToLobbyLog({
                lobbyClient: api.getLobbyClient(),
                lobbyId: api.getLobbyId(),
                playerId,
                tick: eng != null ? eng.gameTick : null,
                severity: 'critical',
                logType: 'debug',
                gameId: api.getGameId(),
                gamePhase: 'battle',
                message:
                    'TODO(host-migration-mid-battle): lobby host player id changed during battle — behaviour undefined',
                context: { previousHostId: prev, nextHostId },
            });
        }
        prevLobbyHostPlayerIdRef.current = nextHostId;
    }, [players, api, playerId, sessionRef]);
}
