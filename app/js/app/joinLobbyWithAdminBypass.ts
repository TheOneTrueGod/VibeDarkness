import type { LobbyClient } from '../LobbyClient';
import { QUEST_PARTY_LOBBY_RESERVED_ERROR } from '../../../global_constants.js';

type JoinLobbyResult = Awaited<ReturnType<LobbyClient['joinLobby']>>;

/**
 * Join a lobby. When the server rejects a non-party member and the account is an
 * admin, ask once whether to bypass the quest-party reservation.
 */
export async function joinLobbyAllowingAdminBypass(
    lobbyClient: LobbyClient,
    lobbyId: string,
    isAdmin: boolean,
): Promise<JoinLobbyResult> {
    try {
        return await lobbyClient.joinLobby(lobbyId);
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (
            isAdmin
            && message === QUEST_PARTY_LOBBY_RESERVED_ERROR
            && window.confirm(`${QUEST_PARTY_LOBBY_RESERVED_ERROR}. Join anyway as an admin?`)
        ) {
            return await lobbyClient.joinLobby(lobbyId, { adminBypassQuestParty: true });
        }
        throw error;
    }
}
