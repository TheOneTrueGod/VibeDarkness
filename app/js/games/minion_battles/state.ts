/**
 * Special character selection value meaning the player is spectating (no character, no orders, no rewards).
 */
export const SPECTATOR_ID = 'spectator';

/** Mission 004 (Monster): player controls the Alpha Wolf boss instead of a hero. Only one player can select. */
export const CONTROL_ENEMY_ALPHA_WOLF = 'control_enemy_alpha_wolf';

export function isSpectator(characterId: string | undefined | null): boolean {
    return characterId === SPECTATOR_ID;
}

export function isControlEnemy(characterId: string | undefined | null): boolean {
    return characterId === CONTROL_ENEMY_ALPHA_WOLF;
}

/**
 * Minion Battles game state (from server or createInitialState).
 * Server sends snake_case (lobby_id, players, hands); we accept both for compatibility.
 */
export type GamePhase =
    | 'start'
    | 'mission_select'
    | 'character_select'
    | 'pre_mission_story'
    | 'battle'
    | 'post_mission_story'
    | 'in_mission';

export interface MinionBattlesState {
    lobbyId?: string;
    lobby_id?: string;
    players: string[];
    hands: Record<string, string[]>;
    gamePhase?: GamePhase;
    game_phase?: GamePhase;
    missionVotes?: Record<string, string>;
    mission_votes?: Record<string, string>;
    /** Map of playerId -> characterId for character selections */
    characterSelections?: Record<string, string>;
    character_selections?: Record<string, string>;
    /** Story choice results: playerId -> choiceId -> optionId (option id from choice phrase). */
    playerStoryChoices?: Record<string, Record<string, string>>;
    /** Derived or stored: playerId -> item IDs equipped from story (e.g. from playerStoryChoices). */
    playerEquippedItems?: Record<string, string[]>;
    /** Player research trees snapshot for runtime battle logic. */
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
}

export interface MinionBattlesGameOptions {
    gameId?: string | null;
    gameType?: string;
    gameData?: Record<string, unknown> | null;
}
