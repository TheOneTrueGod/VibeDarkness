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
    gameId?: string | null;
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
