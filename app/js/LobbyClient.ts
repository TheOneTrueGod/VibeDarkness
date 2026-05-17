/**
 * Lobby Client
 * Handles HTTP API calls for lobby management
 */

import type { CampaignResourceKey, BattleOrderRecord, HeartbeatResponse } from './types';
import type { BattleOrder, SerializedGameState } from './games/minion_battles/game/types';
import { isBattleHeartbeatTraceEnvOn, traceBattleHeartbeatLine } from './battleHeartbeatTrace';

/** Campaign character as returned from API (serializable). */
export interface CampaignCharacterPayload {
    id: string;
    ownerAccountId?: number;
    name?: string;
    equipment: string[];
    knowledge: Record<string, Record<string, unknown>>;
    traits: string[];
    portraitId: string;
    battleChipDetails: Record<string, unknown>;
    campaignId: string;
    missionId: string;
    researchTrees?: Record<string, string[]>;
    lastUsed?: number;
}

/** Payload to create a campaign character. */
export interface CreateCharacterPayload {
    portraitId: string;
    campaignId: string;
    missionId: string;
    /** Display name (e.g. random from pool). */
    name?: string;
    equipment?: string[];
    knowledge?: Record<string, Record<string, unknown>>;
    traits?: string[];
    battleChipDetails?: Record<string, unknown>;
}

/** Single entry from GET /api/active-lobbies */
export interface ActiveLobbyEntry {
    lobby_id: string;
    last_update: number;
    player_ids: string[];
    name?: string;
    lobbyState?: 'home' | 'in_game';
    gameType?: string | null;
}

interface ApiResponse {
    success: boolean;
    error?: string;
    /** Some account endpoints return `user` instead of `account`. */
    user?: AccountInfo;
    account?: AccountInfo;
    accounts?: AccountInfo[];
    campaign?: import('./types').CampaignState;
    lobbies?: LobbySummary[];
    activeLobbies?: ActiveLobbyEntry[];
    lobby?: LobbyState;
    player?: PlayerInfo;
    playerId?: string;
    isRejoin?: boolean;
    gameState?: LobbyStateResult['gameState'];
    lastMessageId?: number | null;
    messages?: PollMessage[];
    messageId?: number;
    chatEntry?: Record<string, unknown>;
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
    inventoryItemIds?: string[];
    knowledge?: Record<string, Record<string, unknown>>;
}

interface AdminAccountDetailsResponse {
    account: AccountInfo;
    characters: CampaignCharacterPayload[];
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

/** One persisted line for `POST /api/lobbies/:id/lobby-log` (and batch). */
export interface AppendLobbyLogBody {
    playerId: string;
    severity?: string;
    tick: number | null;
    message: string;
    logType: 'desync' | 'battleSync' | 'debug';
    context?: Record<string, unknown>;
    gameId?: string;
    gamePhase?: string;
}

export class LobbyClient {
    private baseUrl: string;

    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /** Root URL prefix for `/api` requests (empty string when same-origin). */
    getBaseUrl(): string {
        return this.baseUrl;
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
            addMissionResult?: {
                missionId: string;
                result: string;
                resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
                grantKnowledgeKeys?: string[];
                itemIds?: string[];
                researchRewardIds?: string[];
                researchRewards?: Array<{ treeId: string; nodeId: string }>;
            };
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

    async getActiveLobbies(): Promise<ActiveLobbyEntry[]> {
        const data = await this.request('/api/active-lobbies');
        return (data.activeLobbies as ActiveLobbyEntry[]) ?? [];
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

    /** Update a campaign character (equipment, name, portraitId). Must be owned by current account. */
    async updateCharacter(
        characterId: string,
        updates: { equipment?: string[]; name?: string; portraitId?: string; researchTrees?: Record<string, string[]> }
    ): Promise<CampaignCharacterPayload> {
        const data = await this.request(`/api/characters/${encodeURIComponent(characterId)}`, {
            method: 'PATCH',
            body: JSON.stringify(updates),
        });
        return data.character as CampaignCharacterPayload;
    }

    /** Delete a campaign character (must be owned by current account). Returns updated character list. */
    async deleteCharacter(characterId: string): Promise<CampaignCharacterPayload[]> {
        const data = await this.request(`/api/characters/${encodeURIComponent(characterId)}`, {
            method: 'DELETE',
        });
        return (data.characters as CampaignCharacterPayload[]) ?? [];
    }

    async researchCharacterNode(
        characterId: string,
        payload: { treeId: string; nodeId: string }
    ): Promise<CampaignCharacterPayload> {
        const data = await this.request(`/api/characters/${encodeURIComponent(characterId)}/research`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        return data.character as CampaignCharacterPayload;
    }

    async getAdminAccountDetails(accountId: number | string): Promise<AdminAccountDetailsResponse> {
        const data = await this.request(`/api/admin/accounts/${encodeURIComponent(String(accountId))}`);
        return {
            account: data.account as AccountInfo,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    async listAdminAccounts(): Promise<AccountInfo[]> {
        const data = await this.request('/api/admin/accounts');
        return (data.accounts as AccountInfo[]) ?? [];
    }

    async grantAccountItem(accountId: number | string, itemId: string): Promise<AdminAccountDetailsResponse> {
        const data = await this.request(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/items`, {
            method: 'POST',
            body: JSON.stringify({ itemId }),
        });
        return {
            account: data.account as AccountInfo,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    async removeAccountItem(accountId: number | string, itemId: string): Promise<AdminAccountDetailsResponse> {
        const data = await this.request(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/items/remove`, {
            method: 'POST',
            body: JSON.stringify({ itemId }),
        });
        return {
            account: data.account as AccountInfo,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    async grantAccountKnowledge(
        accountId: number | string,
        key: string,
        details?: Record<string, unknown>
    ): Promise<AdminAccountDetailsResponse> {
        const data = await this.request(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/knowledge`, {
            method: 'POST',
            body: JSON.stringify({ key, details: details ?? {} }),
        });
        return {
            account: data.account as AccountInfo,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    async grantAccountResource(
        accountId: number | string,
        resourceKey: 'fire' | 'water' | 'earth' | 'air',
        delta: number,
    ): Promise<AdminAccountDetailsResponse> {
        const data = await this.request(`/api/admin/accounts/${encodeURIComponent(String(accountId))}/resources`, {
            method: 'POST',
            body: JSON.stringify({ resourceKey, delta }),
        });
        return {
            account: data.account as AccountInfo,
            characters: (data.characters as CampaignCharacterPayload[]) ?? [],
        };
    }

    async grantCampaignResource(
        campaignId: string,
        resourceKey: CampaignResourceKey,
        delta: number,
    ): Promise<import('./types').CampaignState> {
        const data = await this.request(`/api/admin/campaigns/${encodeURIComponent(campaignId)}/resources`, {
            method: 'POST',
            body: JSON.stringify({ resourceKey, delta }),
        });
        return data.campaign as import('./types').CampaignState;
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

    async appendLobbyLog(lobbyId: string, body: AppendLobbyLogBody): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/lobby-log`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async appendLobbyLogBatch(
        lobbyId: string,
        body: { playerId: string; lines: AppendLobbyLogBody[] },
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/lobby-log/batch`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    // ---- Battle Phase: Checkpoints (`snapshots/<tick>.json`, `initial_state.json`) & orders ----

    async appendBattleOrder(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; atTick: number; order: BattleOrder; idHash?: string },
    ): Promise<{
        accepted: boolean;
        idHash: string;
        pendingLineId?: string | null;
        rejectedReason?: string;
        maxAllowedTick?: number;
        minAllowedTick?: number;
        hostTick?: number;
        hostFingerprint?: string | null;
    }> {
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/orders`, {
            method: 'POST',
            body: JSON.stringify(body),
        }) as unknown as {
            appended?: boolean;
            idHash?: string;
            pendingLineId?: string | null;
            rejectedReason?: string;
            maxAllowedTick?: number;
            minAllowedTick?: number;
            hostTick?: number | null;
            hostFingerprint?: string | null;
        };
        return {
            accepted: data.appended === true,
            idHash: data.idHash ?? body.idHash ?? '',
            pendingLineId: typeof data.pendingLineId === 'string' ? data.pendingLineId : null,
            rejectedReason: typeof data.rejectedReason === 'string' ? data.rejectedReason : undefined,
            maxAllowedTick: typeof data.maxAllowedTick === 'number' ? data.maxAllowedTick : undefined,
            minAllowedTick: typeof data.minAllowedTick === 'number' ? data.minAllowedTick : undefined,
            hostTick: typeof data.hostTick === 'number' ? data.hostTick : undefined,
            hostFingerprint: typeof data.hostFingerprint === 'string' ? data.hostFingerprint : null,
        };
    }

    async mergeBattleAppliedOrders(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; batchAtTick: number },
    ): Promise<{ success: boolean; merged: number }> {
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/orders/merge-applied`, {
            method: 'POST',
            body: JSON.stringify(body),
        }) as unknown as {
            success?: boolean;
            merged?: number;
        };
        return { success: data.success === true, merged: typeof data.merged === 'number' ? data.merged : 0 };
    }

    async getBattleOrdersRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; sinceTick?: number; untilTick?: number },
    ): Promise<{ orders: BattleOrderRecord[]; pendingOrders?: BattleOrderRecord[]; appliedOrders?: BattleOrderRecord[] }> {
        const query = new URLSearchParams({ playerId: params.playerId });
        if (params.sinceTick !== undefined) {
            query.set('sinceTick', String(params.sinceTick));
        }
        if (params.untilTick !== undefined) {
            query.set('untilTick', String(params.untilTick));
        }
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/orders?${query}`) as unknown as {
            orders?: BattleOrderRecord[];
            pendingOrders?: BattleOrderRecord[];
            appliedOrders?: BattleOrderRecord[];
        };
        return {
            orders: data.orders ?? [],
            pendingOrders: data.pendingOrders,
            appliedOrders: data.appliedOrders,
        };
    }

    async getBattleHeartbeat(
        lobbyId: string,
        gameId: string,
        playerId: string,
        opts?: { gameTick?: number; includePastApplied?: boolean },
    ): Promise<HeartbeatResponse> {
        const query = new URLSearchParams({ playerId });
        if (opts?.gameTick !== undefined) {
            query.set('gameTick', String(opts.gameTick));
        }
        if (opts?.includePastApplied === true) {
            query.set('includePastApplied', '1');
        }
        let stack: string | undefined;
        if (isBattleHeartbeatTraceEnvOn()) {
            const capture = new Error();
            stack =
                typeof capture.stack === 'string' ? capture.stack.split('\n').slice(1, 10).join('\n') : undefined;
        }
        traceBattleHeartbeatLine('LobbyClient.getBattleHeartbeat (HTTP)', {
            lobbyId,
            gameId,
            playerId,
            gameTick: opts?.gameTick ?? null,
            includePastApplied: opts?.includePastApplied === true,
            stack,
        });
        const data = await this.request(
            `/api/lobbies/${lobbyId}/games/${gameId}/heartbeat?${query}`
        ) as unknown as HeartbeatResponse;
        return {
            heartbeatSeq: data.heartbeatSeq ?? null,
            hostTick: data.hostTick ?? null,
            hostFingerprint: data.hostFingerprint ?? null,
            latestServerGameTick: data.latestServerGameTick ?? null,
            latestServerGameHash: data.latestServerGameHash ?? null,
            gameTick: data.gameTick ?? null,
            gameHash: data.gameHash ?? null,
            requestedGameTick:
                typeof data.requestedGameTick === 'number' ? data.requestedGameTick : data.gameTick ?? null,
            requestedGameHash:
                typeof data.requestedGameHash === 'string' ? data.requestedGameHash : data.gameHash ?? null,
            requestedGamePaused:
                typeof data.requestedGamePaused === 'boolean' ? data.requestedGamePaused : null,
            pendingOrders: data.pendingOrders,
            appliedOrdersAtTick: data.appliedOrdersAtTick,
            pastAppliedActions: data.pastAppliedActions,
            hostPaused: typeof data.hostPaused === 'boolean' ? data.hostPaused : false,
            ordersTipTick: data.ordersTipTick ?? null,
            ordersRecordCount: data.ordersRecordCount ?? null,
            orderBatchAtTick: typeof data.orderBatchAtTick === 'number' ? data.orderBatchAtTick : null,
            pausedAtTick: data.pausedAtTick ?? null,
            expectingFromPlayerIds: data.expectingFromPlayerIds ?? null,
            initialFingerprint: data.initialFingerprint ?? null,
            fingerprintTailTick: typeof data.fingerprintTailTick === 'number' ? data.fingerprintTailTick : null,
            fingerprintTailFingerprint:
                typeof data.fingerprintTailFingerprint === 'string' ? data.fingerprintTailFingerprint : null,
        };
    }

    async saveBattleSnapshot(
        lobbyId: string,
        gameId: string,
        body: {
            playerId: string;
            tick: number;
            state: SerializedGameState;
            checkpointFingerprint?: string;
            checkpointFingerprintPaused?: boolean;
        },
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/snapshot`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async getBattleSnapshot(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; atTick?: number },
    ): Promise<{ tick: number; state: SerializedGameState; synchash: string | null } | null> {
        const query = new URLSearchParams({ playerId: params.playerId });
        if (params.atTick !== undefined) {
            query.set('atTick', String(params.atTick));
        }
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/snapshot?${query}`) as unknown as {
            snapshot?: {
                tick: number;
                state: SerializedGameState;
                synchash?: string | null;
            } | null;
        };
        const snap = data.snapshot ?? null;
        if (snap == null) {
            return null;
        }
        return {
            tick: snap.tick,
            state: snap.state,
            synchash: typeof snap.synchash === 'string' ? snap.synchash : null,
        };
    }

    async saveBattleInitialState(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; state: SerializedGameState; initialFingerprint: string },
    ): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/initial-state`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    }

    async getBattleInitialState(
        lobbyId: string,
        gameId: string,
        playerId: string,
    ): Promise<{ state: SerializedGameState; initialFingerprint: string } | null> {
        const query = new URLSearchParams({ playerId });
        const data = await this.request(
            `/api/lobbies/${lobbyId}/games/${gameId}/initial-state?${query}`,
        ) as unknown as {
            initialState?: { state: SerializedGameState; initialFingerprint: string } | null;
        };
        return data.initialState ?? null;
    }

    async appendBattleFingerprints(
        lobbyId: string,
        gameId: string,
        body: { playerId: string; records: Array<{ tick: number; fp: string; paused: boolean }> },
    ): Promise<{ appended: number }> {
        const data = await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/fingerprints`, {
            method: 'POST',
            body: JSON.stringify(body),
        }) as unknown as { appended?: number };
        return { appended: data.appended ?? 0 };
    }

    async getBattleFingerprintsRange(
        lobbyId: string,
        gameId: string,
        params: { playerId: string; fromTick: number; toTick: number },
    ): Promise<{ records: Array<{ tick: number; fp: string; paused: boolean }> }> {
        const query = new URLSearchParams({
            playerId: params.playerId,
            fromTick: String(params.fromTick),
            toTick: String(params.toTick),
        });
        const data = await this.request(
            `/api/lobbies/${lobbyId}/games/${gameId}/fingerprints?${query}`,
        ) as unknown as {
            fingerprints?: Array<{ tick: number; fp: string; paused?: boolean }>;
            records?: Array<{ tick: number; fp: string; paused?: boolean }>;
        };
        const raw = data.records ?? data.fingerprints ?? [];
        return {
            records: raw.map((r) => ({
                tick: r.tick,
                fp: r.fp,
                paused: r.paused === true,
            })),
        };
    }

    /**
     * Admin only: clear battle checkpoints and engine fields on the server so post-story lobby
     * state remains but the mission combat is re-created from the mission definition on resync.
     */
    async resetBattleToInitialSnapshot(lobbyId: string, gameId: string, playerId: string): Promise<void> {
        await this.request(`/api/lobbies/${lobbyId}/games/${gameId}/reset-to-initial-snapshot`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
        });
    }

    // ---- Player ID tracking (set by the app after join) ----

    setCurrentPlayerId(_playerId: string): void {
        // Legacy no-op shim kept during migration while call sites are still present.
    }
}
