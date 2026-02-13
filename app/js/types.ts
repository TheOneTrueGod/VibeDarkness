/**
 * Shared frontend types for lobby, players, and API payloads
 */

export interface LobbyState {
    id: string;
    name: string;
}

export interface PlayerState {
    id: string;
    name: string;
    color: string;
    isHost?: boolean;
    isConnected?: boolean;
}

export interface AccountState {
    id: number;
    name: string;
    fire: number;
    water: number;
    earth: number;
    air: number;
}

export interface GameStatePayload {
    lobbyState?: string;
    /** Unique game instance id (for save file and API) */
    gameId?: string | null;
    /** Game type id (e.g. minion_battles) used to load the game UI module */
    gameType?: string | null;
    /** Game-specific state (when in game); contents of game save file */
    game?: Record<string, unknown>;
    players: Record<string, PlayerState>;
    clicks: Record<string, { playerId: string; playerName: string; color: string; x: number; y: number }>;
    chatHistory: unknown[];
}

export interface PollMessagePayload {
    messageId?: number;
    type: string;
    data: Record<string, unknown>;
}

/** Chat message payload used when adding a message from poll (matches ChatManager.addMessage) */
export interface ChatMessageData {
    playerId?: string;
    playerName?: string;
    playerColor?: string;
    message?: string;
    timestamp?: number;
}
