/**
 * DTO and wire-format types for Minion Battles ↔ server (lobby game JSON, characters, admin).
 */
import type { CampaignCharacterPayload, CreateCharacterPayload } from '../../../LobbyClient';
import type { AccountState, CampaignResourceKey, CampaignState, MissionResult } from '../../../types';
import type { QuestResult, QuestRunState } from '../storylines/questTypes';
import type { GamePhase } from '../state';

export type { CampaignCharacterPayload, CreateCharacterPayload };

// ---------------------------------------------------------------------------
// Admin (mirrors LobbyClient admin responses; typed account field)
// ---------------------------------------------------------------------------

export interface AdminAccountDetails {
    account: AccountState;
    characters: CampaignCharacterPayload[];
}

export interface CharacterUpdates {
    equipment?: string[];
    name?: string;
    portraitId?: string;
    researchTrees?: Record<string, string[]>;
    /** Per-tree node level counts for multi-level (passive) research nodes. */
    researchNodeLevels?: Record<string, Record<string, number>>;
    /** Per-campaign mission results; key = campaignId. */
    missionResults?: Record<string, MissionResult[]>;
    /** Per-campaign quest results; key = campaignId. */
    questResults?: Record<string, QuestResult[]>;
    /** Active QuestRun (includes Quest Character); null clears. */
    activeQuestRun?: QuestRunState | null;
    /** Active campaign for this character. */
    campaignId?: string;
}

export interface SendMessageResult {
    messageId: number;
    chatEntry?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Lobby game JSON (poll + updateGameState)
// ---------------------------------------------------------------------------

/** Known keys on the Minion Battles lobby `game` blob (server may add more). */
export interface MinionBattlesGameStatePayload {
    gamePhase?: GamePhase;
    game_phase?: GamePhase;
    selectedMissionId?: string;
    selected_mission_id?: string;
    characterSelections?: Record<string, string>;
    character_selections?: Record<string, string>;
    /** In-battle unit label: player's chosen character display name by player ID (camelCase/snake_case both). */
    characterDisplayNames?: Record<string, string>;
    character_display_names?: Record<string, string>;
    storyReadyPlayerIds?: string[];
    characterSelectReadyPlayerIds?: string[];
    character_select_ready_player_ids?: string[];
    playerEquipmentByPlayer?: Record<string, string[]>;
    groupVoteVotes?: Record<string, Record<string, string>>;
    units?: unknown[];
    gameTick?: number;
    game_tick?: number;
    synchash?: string;
    waitingForOrders?: unknown;
    /**
     * Players whose presence is required before the battle can start.
     * Matched by playerName (the account display name). Host cannot start until all are present.
     * Each entry locks the characterId to that player (pre-selected, cannot change).
     */
    requiredPlayers?: Array<{ playerName: string; characterId: string }>;
    /**
     * Server-generated 32-bit unsigned battle seed.
     * Minted once when the lobby first leaves `character_select` (entering
     * pre_mission_story / battle / post_mission_story) and persisted in the
     * lobby's game JSON thereafter. All peers (host + clients) read the same
     * value so deterministic battle init (RNG, spawn picks, etc.) agrees.
     * Absent while the lobby is still in `character_select`.
     */
    battleSeed?: number;
    /**
     * Lobby ID the host has created for the next mission.
     * Written by the host via updateGameState after victory; clients poll for
     * this to know when to show the "Continue" button.
     */
    nextLobbyId?: string;
    /**
     * Active quest mission chain (optional). When set, continue/retry use the
     * character's `activeQuestRun` resolved slots instead of storyline edges.
     */
    questDefId?: string;
    questRunId?: string;
    /** Index into `activeQuestRun.resolvedSlots` for this lobby's mission. */
    questSlotIndex?: number;
    /** Seed used to resolve quest slots (joiners recreate matching prep runs). */
    questRunSeed?: number;
    /**
     * In-progress Quest Prep primary ability picks by player id (lobby sync during prep).
     */
    questPrepLoadoutsByPlayer?: Record<string, string[]>;
    /**
     * Frozen Quest Prep primary ability picks by character id (survives continue lobbies
     * when player ids change).
     */
    questAbilityLoadoutsByCharacterId?: Record<string, string[]>;
}

/** Full game blob from polling (may include arbitrary extra keys from the server). */
export type MinionBattlesGameDataPayload = MinionBattlesGameStatePayload & Record<string, unknown>;

/** Arguments to PATCH-style game state updates (host). */
export type MinionBattlesGameStatePatch = Partial<MinionBattlesGameStatePayload> & Record<string, unknown>;

// Re-export campaign types used by the API surface
export type { CampaignState, CampaignResourceKey };
