/**
 * Typed API facade for Minion Battles.
 *
 * Wraps the project-level LobbyClient so that minion-battles code never
 * reaches up to ../../LobbyClient directly.  Callers get typed methods
 * and no longer need to pass lobbyId / gameId / playerId on every call.
 */
import type { LobbyClient, CampaignCharacterPayload, CreateCharacterPayload } from '../../../LobbyClient';
import type { CampaignState, CampaignResourceKey, AccountState } from '../../../types';

export type { CampaignCharacterPayload, CreateCharacterPayload };

// ---------------------------------------------------------------------------
// DTO types for admin responses (LobbyClient uses a private interface)
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
// API class
// ---------------------------------------------------------------------------

export class MinionBattlesApi {
    constructor(
        private readonly lobbyClient: LobbyClient,
        private readonly lobbyId: string,
        private readonly gameId: string,
        private readonly _playerId: string,
    ) {}

    // -- Game state & messaging ---------------------------------------------

    async updateGameState(updates: Record<string, unknown>): Promise<Record<string, unknown>> {
        return this.lobbyClient.updateGameState(this.lobbyId, this.gameId, this._playerId, updates);
    }

    async sendMessage(type: string, data: Record<string, unknown>): Promise<SendMessageResult> {
        return this.lobbyClient.sendMessage(this.lobbyId, this._playerId, type, data);
    }

    // -- Character CRUD -----------------------------------------------------

    async getMyCharacters(): Promise<CampaignCharacterPayload[]> {
        return this.lobbyClient.getMyCharacters();
    }

    async createCharacter(
        payload: CreateCharacterPayload,
    ): Promise<{ character: CampaignCharacterPayload; characters: CampaignCharacterPayload[] }> {
        return this.lobbyClient.createCharacter(payload);
    }

    async getCharacter(characterId: string): Promise<CampaignCharacterPayload> {
        return this.lobbyClient.getCharacter(characterId);
    }

    async updateCharacter(characterId: string, updates: CharacterUpdates): Promise<CampaignCharacterPayload> {
        return this.lobbyClient.updateCharacter(characterId, updates);
    }

    async deleteCharacter(characterId: string): Promise<CampaignCharacterPayload[]> {
        return this.lobbyClient.deleteCharacter(characterId);
    }

    async researchCharacterNode(
        characterId: string,
        payload: { treeId: string; nodeId: string },
    ): Promise<CampaignCharacterPayload> {
        return this.lobbyClient.researchCharacterNode(characterId, payload);
    }

    // -- Campaign -----------------------------------------------------------

    async getCampaign(campaignId: string): Promise<CampaignState> {
        return this.lobbyClient.getCampaign(campaignId);
    }

    async grantCampaignResource(
        campaignId: string,
        resourceKey: CampaignResourceKey,
        delta: number,
    ): Promise<CampaignState> {
        return this.lobbyClient.grantCampaignResource(campaignId, resourceKey, delta);
    }

    // -- Admin --------------------------------------------------------------

    async getAdminAccountDetails(accountId: number | string): Promise<AdminAccountDetails> {
        return this.lobbyClient.getAdminAccountDetails(accountId) as Promise<AdminAccountDetails>;
    }

    async grantAccountItem(accountId: number | string, itemId: string): Promise<AdminAccountDetails> {
        return this.lobbyClient.grantAccountItem(accountId, itemId) as Promise<AdminAccountDetails>;
    }

    async removeAccountItem(accountId: number | string, itemId: string): Promise<AdminAccountDetails> {
        return this.lobbyClient.removeAccountItem(accountId, itemId) as Promise<AdminAccountDetails>;
    }

    // -- Battle utility -----------------------------------------------------

    setCurrentPlayerId(): void {
        this.lobbyClient.setCurrentPlayerId(this._playerId);
    }
}
