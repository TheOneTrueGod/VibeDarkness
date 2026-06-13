/**
 * Shared frontend types for lobby, players, and API payloads
 */
import type { BattleOrder } from './games/minion_battles/game/types';

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
    /** Unix timestamp when emergency recovery expires, null/undefined if not active */
    emergencyRecoveryExpiresAt?: number | null;
}

export interface CampaignCharacter {
    id: string;
    name: string;
    characterId: string;
}

export interface MissionResearchRewardEntry {
    treeId: string;
    nodeId: string;
}

export interface MissionResult {
    missionId: string;
    result: string;
    timestamp?: number;
    /** Mission reward deltas; summed with campaign.resources for effective display. */
    resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
    /** Optional item card reward ids granted for the mission result. */
    itemCardIds?: string[];
    /** Optional single item reward id for compatibility with older payload shapes. */
    itemId?: string;
    /** Optional generic item id array for compatibility with alternate payload shapes. */
    itemIds?: string[];
    /** Canonical research reward ids (`treeId+nodeId`). */
    researchRewardIds?: string[];
    /**
     * Optional research nodes awarded by this mission result.
     * Duplicate `{ treeId, nodeId }` entries are allowed.
     */
    researchRewards?: MissionResearchRewardEntry[];
    /** Set to true when an admin manually granted this result rather than it being earned in-game. */
    adminGranted?: boolean;
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
    /** Battle objectives (Minion Battles); shown as a todo-style list above chat. */
    objectives: { id: string; label: string; completed: boolean }[];
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

export interface HeartbeatResponse {
    /** Server storage activity stamp (max mtime of snapshots, orders, fingerprints). */
    heartbeatSeq?: number | null;
    /** Wire name for authoritative last completed simulation tick (= human-facing `serverTick`). */
    hostTick: number | null;
    hostFingerprint: string | null;
    /** Doc alias: same as `hostTick` / `hostFingerprint`. */
    latestServerGameTick?: number | null;
    latestServerGameHash?: string | null;
    /** Legacy client query echo: hash at `gameTick` when `gameTick` query param set. */
    gameTick?: number | null;
    gameHash?: string | null;
    /**
     * Dual fingerprint echo (preferred): what the client asked about via `?gameTick=N`.
     * - `requestedGameTick`: echoes the numeric tick the client sent (null when 'latest' / non-numeric / unset).
     * - `requestedGameHash`: fingerprint at that tick from `fingerprints.jsonl`, or null when no row.
     * - `requestedGamePaused`: `paused` flag at that tick, or null when no row.
     * Authoritative latest tail stays in `hostTick` / `hostFingerprint` / `hostPaused`.
     */
    requestedGameTick?: number | null;
    requestedGameHash?: string | null;
    requestedGamePaused?: boolean | null;
    pendingOrders?: BattleOrderRecord[];
    appliedOrdersAtTick?: { atTick: number | null; orders: BattleOrderRecord[] };
    /**
     * Present only when the client sent `includePastApplied=1` with numeric `?gameTick=N`.
     * Applied rows for `atTick >= N + 1` through the applied log (same shape as `appliedOrders`
     * on `GET …/orders` for that range). Empty array when `N >= hostTick`.
     */
    pastAppliedActions?: BattleOrderRecord[] | null;
    /** `paused` from fingerprints.jsonl for `hostTick` (false when unknown / no row). */
    hostPaused?: boolean | null;
    ordersTipTick: number | null;
    /** Monotonic-ish count of order rows — advances when append wins even if atTick repeats. */
    ordersRecordCount?: number | null;
    /**
     * Parallel order batch (`waitingForOrders.atTick`), only while paused waiting on waiters.
     * Same value as `pausedAtTick` when both are present (backward-compatible alias).
     */
    orderBatchAtTick?: number | null;
    /**
     * When non-null during a parallel pause, same as `orderBatchAtTick` (batch tick for submitted orders).
     * Not the checkpoint envelope tick.
     */
    pausedAtTick: number | null;
    expectingFromPlayerIds: string[] | null;
    initialFingerprint: string | null;
    /**
     * Max tick in `fingerprints.jsonl` (unclamped). May exceed `hostTick` while snapshot
     * `waitingForOrders.atTick` still lags; see `BattleStorage::resolveLastCompletedTickAndFingerprint`.
     */
    fingerprintTailTick?: number | null;
    fingerprintTailFingerprint?: string | null;
}

export interface BattleOrderRecord {
    atTick: number;
    playerId: string;
    order: BattleOrder;
    idHash: string;
    pendingLineId?: string;
    finalized?: boolean;
    basisFingerprint?: string;
}

/** Chat message payload used when adding a message from poll (matches ChatManager.addMessage) */
export interface ChatMessageData {
    playerId?: string;
    playerName?: string;
    playerColor?: string;
    message?: string;
    timestamp?: number;
}
