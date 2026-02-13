/**
 * Base class for game types. Subclasses define createInitialState() to supply
 * game-specific initial state; the base provides lobbyId and players.
 */

export interface BaseGameState {
    lobbyId: string;
    players: string[];
}

export abstract class BaseGame {
    /**
     * Return base initial state: lobbyId and list of player IDs.
     * Subclasses should merge this with their own state.
     */
    static createInitialState(lobbyId: string, playerIds: string[]): BaseGameState {
        return {
            lobbyId,
            players: [...playerIds],
        };
    }
}
