/**
 * Lobby Client
 * Handles HTTP API calls for lobby management
 */

/** Campaign character as returned from API (serializable). */
export interface CampaignCharacterPayload {
    id: string;
    ownerAccountId?: number;
    equipment: string[];
    knowledge: Record<string, Record<string, unknown>>;
    traits: string[];
    portraitId: string;
    battleChipDetails: Record<string, unknown>;
    campaignId: string;
    missionId: string;
}

/** Payload to create a campaign character. */
export interface CreateCharacterPayload {
    portraitId: string;
    campaignId: string;
    missionId: string;
    equipment?: string[];
    knowledge?: Record<string, Record<string, unknown>>;
    traits?: string[];
    battleChipDetails?: Record<string, unknown>;
}

interface ApiResponse {
    success: boolean;
    error?: string;
    account?: AccountInfo;
    campaign?: import('./types').CampaignState;
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
    gameStateData?: Record<string, unknown>;
    character?: CampaignCharacterPayload;
    characters?: CampaignCharacterPayload[];
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
    playerCount?: number;
    lobbyState?: 'home' | 'in_game';
    gameType?: string | null;
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
    role: 'user' | 'admin';
    fire: number;
    water: number;
    earth: number;
    air: number;
    recentLobbies?: string[];
    campaignIds?: string[];
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
            credentials: 'include',
        };
        const response = await fetch(url, { ...defaultOptions, ...options });
        const data = (await response.json()) as ApiResponse;
        if (!data.success) {
            throw new Error((data.error as string) || 'Request failed');
        }
        return data;
    }

    async login(username: string, password: string): Promise<AccountInfo> {
        const data = await this.request('/api/account/login', {
            method: 'POST',
            body: JSON.stringify({ username: username.trim(), password }),
        });
        return data.account as AccountInfo;
    }

    async createAccount(username: string, password: string): Promise<AccountInfo> {
        const data = await this.request('/api/account/create', {
            method: 'POST',
            body: JSON.stringify({ username: username.trim(), password }),
        });
        return data.account as AccountInfo;
    }

    async getMe(): Promise<AccountInfo | null> {
        const data = await this.request('/api/account/me');
        return data.user ?? null;
    }

    async logout(): Promise<void> {
        await this.request('/api/account/logout', { method: 'POST' });
    }

    async createCampaign(): Promise<import('./types').CampaignState> {
        const data = await this.request('/api/campaigns', { method: 'POST', body: JSON.stringify({}) });
        return data.campaign as import('./types').CampaignState;
    }

    async getCampaign(campaignId: string): Promise<import('./types').CampaignState> {
        const data = await this.request(`/api/campaigns/${encodeURIComponent(campaignId)}`);
        return data.campaign as import('./types').CampaignState;
    }

    async updateCampaign(
        campaignId: string,
        payload: Partial<import('./types').CampaignState> & {
            addMissionResult?: { missionId: string; result: string; resourceDelta?: { food?: number; metal?: number; population?: number } };
        }
    ): Promise<import('./types').CampaignState> {
        const data = await this.request(`/api/campaigns/${encodeURIComponent(campaignId)}`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
        });
        return data.campaign as import('./types').CampaignState;
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

    async joinLobby(lobbyId: string): Promise<JoinLobbyResult> {
        const data = await this.request(`/api/lobbies/${lobbyId}/join`, {
            method: 'POST',
            body: JSON.stringify({}),
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
    ): Promise<{ messageId: number; chatEntry?: Record<string, unknown> }> {
        const res = await this.request(`/api/lobbies/${lobbyId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ playerId, type, data }),
        });
        return {
            messageId: res.messageId as number,
            chatEntry: res.chatEntry as Record<string, unknown> | undefined,
        };
    }

    async getStats(): Promise<unknown> {
        const data = await this.request('/api/stats');
        return data.stats;
    }

    /** List campaign characters for the current account. Requires login. */
    async getMyCharacters(): Promise<CampaignCharacterPayload[]> {
        const data = await this.request('/api/account/characters');
        return (data.characters as CampaignCharacterPayload[]) ?? [];
    }

    /** Create a campaign character. Requires login. Returns the created character. */
    async createCharacter(
        payload: CreateCharacterPayload,
    ): Promise<{ character: CampaignCharacterPayload; characters: CampaignCharacterPayload[] }> {
        const data = await this.request('/api/account/characters', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return {
            character: data.character as CampaignCharacterPayload,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    /** Get a single campaign character by ID (must be owned by current account). */
    async getCharacter(characterId: string): Promise<CampaignCharacterPayload> {
        const data = await this.request(`/api/characters/${encodeURIComponent(characterId)}`);
        return data.character as CampaignCharacterPayload;
    }

    async updateGameState(
        lobbyId: string,
        gameId: string,
        playerId: string,
        updates: Record<string, unknown>
    ): Promise<Record<string, unknown>> {
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/state`, {
            method: 'POST',
            body: JSON.stringify({ playerId, updates }),
        });
        return (data.gameState as Record<string, unknown>) ?? {};
    }

    // ---- Battle Phase: Checkpoints (game_<id>_<gameTick>.json) & Orders ----

    /** Save a checkpoint at the given game tick (state + orders). Host only. */
    async saveGameStateSnapshot(
        lobbyId: string,
        gameId: string,
        gameTick: number,
        state: Record<string, unknown>,
        orders: Array<{ gameTick: number; order: Record<string, unknown> }> = [],
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/snapshots`, {
            method: 'POST',
            body: JSON.stringify({
                playerId: this._currentPlayerId ?? '',
                gameTick,
                state,
                orders,
            }),
        });
    }

    /** Get a checkpoint by game tick, or latest if gameTick is undefined. */
    async getGameStateSnapshot(
        lobbyId: string,
        gameId: string,
        gameTick?: number,
    ): Promise<{ gameTick: number; state: Record<string, unknown>; orders: Array<{ gameTick: number; order: Record<string, unknown> }> } | null> {
        const endpoint = gameTick !== undefined
            ? `/api/lobbies/${lobbyId}/games/${gameId}/snapshots/${gameTick}`
            : `/api/lobbies/${lobbyId}/games/${gameId}/snapshots`;
        const params = new URLSearchParams({ playerId: this._currentPlayerId ?? '' });
        const data = await this.request(`${endpoint}?${params}`) as { snapshot: { gameTick: number; state: Record<string, unknown>; orders: Array<{ gameTick: number; order: Record<string, unknown> }> } | null; gameTick: number | null };
        if (!data.snapshot) return null;
        return {
            gameTick: data.snapshot.gameTick ?? data.gameTick ?? 0,
            state: data.snapshot.state ?? {},
            orders: data.snapshot.orders ?? [],
        };
    }

    /** Add an order to a checkpoint file (atTick = tick when order is applied). */
    async saveGameOrders(
        lobbyId: string,
        gameId: string,
        checkpointGameTick: number,
        atTick: number,
        order: Record<string, unknown>,
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/orders/${checkpointGameTick}`, {
            method: 'POST',
            body: JSON.stringify({
                playerId: this._currentPlayerId ?? '',
                atTick,
                order,
            }),
        });
    }

    /** Get orders (and optional state) for a checkpoint. */
    async getGameOrders(
        lobbyId: string,
        gameId: string,
        checkpointGameTick: number,
    ): Promise<{ orders: Array<{ gameTick: number; order: Record<string, unknown> }>; state: Record<string, unknown> | null; gameTick: number } | null> {
        const params = new URLSearchParams({ playerId: this._currentPlayerId ?? '' });
        const data = await this.request(
            `/api/lobbies/${lobbyId}/games/${gameId}/orders/${checkpointGameTick}?${params}`,
        ) as { orders: Array<{ gameTick: number; order: Record<string, unknown> }> | null; state: Record<string, unknown> | null; gameTick: number };
        if (data.orders == null) return null;
        return {
            orders: data.orders,
            state: data.state ?? null,
            gameTick: data.gameTick ?? checkpointGameTick,
        };
    }

    // ---- Player ID tracking (set by the app after join) ----

    private _currentPlayerId: string | null = null;

    setCurrentPlayerId(playerId: string): void {
        this._currentPlayerId = playerId;
    }
}
