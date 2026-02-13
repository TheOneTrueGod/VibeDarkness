/**
 * Lobby Client
 * Handles HTTP API calls for lobby management
 */

interface ApiResponse {
    success: boolean;
    error?: string;
    account?: AccountInfo;
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

interface AccountInfo {
    id: number;
    name: string;
    fire: number;
    water: number;
    earth: number;
    air: number;
}

interface CreateLobbyResult {
    lobby: LobbyState;
    player: PlayerInfo;
    account: AccountInfo;
}

interface JoinLobbyResult {
    lobby: LobbyState;
    player: PlayerInfo;
    account: AccountInfo;
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

export class LobbyClient {
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

    async signIn(name: string): Promise<AccountInfo> {
        const data = await this.request('/api/account/signin', {
            method: 'POST',
            body: JSON.stringify({ name: name.trim() }),
        });
        return data.account as AccountInfo;
    }

    async listLobbies(): Promise<LobbySummary[]> {
        const data = await this.request('/api/lobbies');
        return data.lobbies as LobbySummary[];
    }

    async createLobby(
        lobbyName: string,
        accountId: number,
        maxPlayers = 8,
        isPublic = true
    ): Promise<CreateLobbyResult> {
        const data = await this.request('/api/lobbies', {
            method: 'POST',
            body: JSON.stringify({ name: lobbyName, accountId, maxPlayers, isPublic }),
        });
        return {
            lobby: data.lobby as LobbyState,
            player: data.player as PlayerInfo,
            account: data.account as AccountInfo,
        };
    }

    async getLobby(lobbyId: string): Promise<LobbyState> {
        const data = await this.request(`/api/lobbies/${lobbyId}`);
        return data.lobby as LobbyState;
    }

    async joinLobby(lobbyId: string, accountId: number): Promise<JoinLobbyResult> {
        const data = await this.request(`/api/lobbies/${lobbyId}/join`, {
            method: 'POST',
            body: JSON.stringify({ accountId }),
        });
        return {
            lobby: data.lobby as LobbyState,
            player: data.player as PlayerInfo,
            account: data.account as AccountInfo,
            isRejoin: data.isRejoin as boolean | undefined,
        };
    }

    async leaveLobby(lobbyId: string, playerId: string): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/leave`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
        });
    }

    async setLobbyState(
        lobbyId: string,
        playerId: string,
        state: 'home' | 'in_game',
        gameId?: string
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/state`, {
            method: 'POST',
            body: JSON.stringify({ playerId, state, gameId: state === 'in_game' ? gameId : undefined }),
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
