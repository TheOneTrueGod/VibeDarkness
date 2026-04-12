/**
 * DTO and wire-format types for Minion Battles ↔ server (lobby game JSON, characters, admin).
 */
import type { CampaignCharacterPayload, CreateCharacterPayload } from '../../../LobbyClient';
import type { AccountState, CampaignResourceKey, CampaignState } from '../../../types';
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
    missionVotes?: Record<string, string>;
    mission_votes?: Record<string, string>;
    characterSelections?: Record<string, string>;
    character_selections?: Record<string, string>;
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
}

/** Full game blob from polling (may include arbitrary extra keys from the server). */
export type MinionBattlesGameDataPayload = MinionBattlesGameStatePayload & Record<string, unknown>;

/** Arguments to PATCH-style game state updates (host). */
export type MinionBattlesGameStatePatch = Partial<MinionBattlesGameStatePayload> & Record<string, unknown>;

// Re-export campaign types used by the API surface
export type { CampaignState, CampaignResourceKey };
