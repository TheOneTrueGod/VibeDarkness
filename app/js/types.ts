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
    role: 'user' | 'admin';
    fire: number;
    water: number;
    earth: number;
    air: number;
    recentLobbies?: string[];
    campaignIds?: string[];
    inventoryItemIds?: string[];
    knowledge?: Record<string, Record<string, unknown>>;
}

export interface CampaignCharacter {
    id: string;
    name: string;
    characterId: string;
}

export interface MissionResult {
    missionId: string;
    result: string;
    timestamp?: number;
}

export interface CampaignResources {
    food: number;
    metal: number;
    population: number;
    crystals: number;
}

export type CampaignResourceKey = keyof CampaignResources;

export interface CampaignState {
    id: string;
    name: string;
    campaignCharacters: CampaignCharacter[];
    missionResults: MissionResult[];
    resources: CampaignResources;
}

/** Info pushed from a game component into the chat sidebar. */
export interface GameSidebarInfo {
    turnIndicator: { visible: boolean; text: string };
    playerUnits: {
        playerId: string;
        playerName: string;
        characterId: string;
        hp: number;
        maxHp: number;
        isAlive: boolean;
    }[];
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

/** Minimal game state from GET /games/{id}/minimal - for sync verification during battle */
export interface MinimalStateResult {
    gameTick: number | null;
    synchash: string | null;
    orders: Array<{ gameTick: number; order: Record<string, unknown> }>;
}

/** Chat message payload used when adding a message from poll (matches ChatManager.addMessage) */
export interface ChatMessageData {
    playerId?: string;
    playerName?: string;
    playerColor?: string;
    message?: string;
    timestamp?: number;
}
