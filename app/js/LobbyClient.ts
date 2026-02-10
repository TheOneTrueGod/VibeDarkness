/**
 * Lobby Client
 * Handles HTTP API calls for lobby management
 */

interface ApiResponse {
    success: boolean;
    error?: string;
    lobbies?: LobbySummary[];
    lobby?: LobbyState;
    player?: PlayerInfo;
    playerId?: string;
    isRejoin?: boolean;
    gameState?: LobbyStateResult['gameState'];
    lastMessageId?: number | null;
    messages?: PollMessage[];
    messageId?: number;
    stats?: unknown;
}

interface LobbySummary {
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
    [key: string]: unknown;
}

interface LobbyState {
    id: string;
    name: string;
    [key: string]: unknown;
}

interface PlayerInfo {
    id: string;
    name: string;
    color: string;
    isHost?: boolean;
    [key: string]: unknown;
}

interface CreateLobbyResult {
    lobby: LobbyState;
    player: PlayerInfo;
}

interface JoinLobbyResult {
    lobby: LobbyState;
    player: PlayerInfo;
    isRejoin?: boolean;
}

interface LobbyStateResult {
    gameState: { players: Record<string, unknown>; clicks: Record<string, unknown>; chatHistory: unknown[] };
    lastMessageId: number | null;
}

interface PollMessage {
    messageId?: number;
    type: string;
    data: Record<string, unknown>;
}

class LobbyClient {
    private baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    private async request(endpoint: string, options: RequestInit = {}): Promise<ApiResponse> {
        const url = `${this.baseUrl}${endpoint}`;
        const defaultOptions: RequestInit = {
            headers: { 'Content-Type': 'application/json' },
        };
        const response = await fetch(url, { ...defaultOptions, ...options });
        const data = (await response.json()) as ApiResponse;
        if (!data.success) {
            throw new Error((data.error as string) || 'Request failed');
        }
        return data;
    }

    async listLobbies(): Promise<LobbySummary[]> {
        const data = await this.request('/api/lobbies');
        return data.lobbies as LobbySummary[];
    }

    async createLobby(
        lobbyName: string,
        playerName: string,
        maxPlayers = 8,
        isPublic = true
    ): Promise<CreateLobbyResult> {
        const data = await this.request('/api/lobbies', {
            method: 'POST',
            body: JSON.stringify({ name: lobbyName, playerName, maxPlayers, isPublic }),
        });
        return { lobby: data.lobby as LobbyState, player: data.player as PlayerInfo };
    }

    async getLobby(lobbyId: string): Promise<LobbyState> {
        const data = await this.request(`/api/lobbies/${lobbyId}`);
        return data.lobby as LobbyState;
    }

    async joinLobby(lobbyId: string, playerName: string): Promise<JoinLobbyResult> {
        const data = await this.request(`/api/lobbies/${lobbyId}/join`, {
            method: 'POST',
            body: JSON.stringify({ playerName }),
        });
        return {
            lobby: data.lobby as LobbyState,
            player: data.player as PlayerInfo,
            isRejoin: data.isRejoin as boolean | undefined,
        };
    }

    async leaveLobby(lobbyId: string, playerId: string): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/leave`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
        });
    }

    async getLobbyState(lobbyId: string, playerId: string): Promise<LobbyStateResult> {
        const data = await this.request(
            `/api/lobbies/${lobbyId}/state?playerId=${encodeURIComponent(playerId)}`
        );
        return {
            gameState: data.gameState as LobbyStateResult['gameState'],
            lastMessageId: (data.lastMessageId as number | null) ?? null,
        };
    }

    async getMessages(
        lobbyId: string,
        playerId: string,
        afterMessageId: number | null = null
    ): Promise<PollMessage[]> {
        const params = new URLSearchParams({ playerId });
        if (afterMessageId != null) {
            params.set('after', String(afterMessageId));
        }
        const data = await this.request(`/api/lobbies/${lobbyId}/messages?${params}`);
        return data.messages as PollMessage[];
    }

    async sendMessage(
        lobbyId: string,
        playerId: string,
        type: string,
        data: Record<string, unknown>
    ): Promise<number> {
        const res = await this.request(`/api/lobbies/${lobbyId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ playerId, type, data }),
        });
        return res.messageId as number;
    }

    async getStats(): Promise<unknown> {
        const data = await this.request('/api/stats');
        return data.stats;
    }
}
