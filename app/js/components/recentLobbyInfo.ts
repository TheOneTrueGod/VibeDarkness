import type { ActiveLobbyEntry } from '../LobbyClient';
import { MISSION_MAP } from '../games/minion_battles/storylines';
import type { RecentLobbyInfo } from './RecentLobbiesList';

/** Active-lobby API row → join-list row, including mission title and host name. */
export function recentLobbyInfoFromActiveEntry(entry: ActiveLobbyEntry): RecentLobbyInfo {
    const missionId = entry.selectedMissionId;
    const fromDef = missionId ? MISSION_MAP[missionId]?.name : undefined;
    const missionName = typeof fromDef === 'string' && fromDef.trim() !== '' ? fromDef : null;
    const host = entry.hostPlayerName?.trim();
    return {
        id: entry.lobby_id,
        name: entry.name ?? entry.lobby_id,
        lobbyState: entry.lobbyState === 'in_game' ? 'in_game' : 'home',
        gameType: entry.gameType ?? null,
        playerCount: entry.player_ids?.length ?? 0,
        missionName,
        hostPlayerName: host ? host : null,
    };
}
