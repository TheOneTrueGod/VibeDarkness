import { useSyncExternalStore } from 'react';
import { getMusicPlayer } from './MusicPlayerController';
import type { MusicPlayerPublicState } from './musicTypes';

export function useMusicPlayerState(): MusicPlayerPublicState {
    const player = getMusicPlayer();
    return useSyncExternalStore(player.subscribe, player.getSnapshot, player.getSnapshot);
}
