/**
 * Minion Battles game state (from server or createInitialState).
 * Server sends snake_case (lobby_id, players, hands); we accept both for compatibility.
 */
export type GamePhase = 'start' | 'mission_select' | 'character_select' | 'in_mission';

export interface MinionBattlesState {
    lobbyId?: string;
    lobby_id?: string;
    players: string[];
    hands: Record<string, string[]>;
    gamePhase?: GamePhase;
    game_phase?: GamePhase;
    missionVotes?: Record<string, string>;
    mission_votes?: Record<string, string>;
}

export interface MinionBattlesGameOptions {
    gameId?: string | null;
    gameType?: string;
    gameData?: Record<string, unknown> | null;
}
