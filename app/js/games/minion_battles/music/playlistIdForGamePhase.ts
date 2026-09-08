import type { GamePhase } from '../state';
import type { MissionType } from '../storylines/types';
import {
    MUSIC_PLAYLIST_BATTLE,
    MUSIC_PLAYLIST_BOSS,
    MUSIC_PLAYLIST_MENU,
    type MusicPlaylistId,
} from './musicConstants';

export function playlistIdForGamePhase(
    gamePhase: GamePhase | null | undefined,
    missionType: MissionType | null | undefined,
): MusicPlaylistId {
    if (gamePhase === 'battle') {
        return missionType === 'boss' ? MUSIC_PLAYLIST_BOSS : MUSIC_PLAYLIST_BATTLE;
    }
    return MUSIC_PLAYLIST_MENU;
}
