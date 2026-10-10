/**
 * Root chrome for authenticated users: starts menu music on campaign screens.
 * Campaign home owns the music player + logout in its header. Lobby still shows
 * the player as an overlay (Leave lives on GameScreen).
 */
import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getMusicPlayer } from '../games/minion_battles/music/MusicPlayerController';
import { MUSIC_PLAYLIST_MENU } from '../games/minion_battles/music/musicConstants';
import MusicPlayer from '../games/minion_battles/ui/components/MusicPlayer';
import { MAX_CONTENT_WIDTH_PX } from './battleUILayout/BattleUISlotLayout';
import DebugConsoleToggle from './DebugConsole/DebugConsoleToggle';

const LOBBY_PATH_PATTERN = /^\/lobby\//;

export default function AppTitleBar() {
    const location = useLocation();
    const inLobby = LOBBY_PATH_PATTERN.test(location.pathname);

    useEffect(() => {
        if (!inLobby) {
            getMusicPlayer().playPlaylist(MUSIC_PLAYLIST_MENU);
        }
    }, [inLobby]);

    if (!inLobby) {
        return null;
    }

    return (
        // h-[52px] matches the battle UI header slot (HeaderSlotLobbyInfo: py-3 + text-xl line) so the
        // player sits vertically centered against it.
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-[200] flex h-[52px] justify-center">
            {/* Same max width as BattleUISlotLayout so the player stays inside the battle container. */}
            <div
                className="flex h-full w-full items-center justify-end px-4"
                style={{ maxWidth: MAX_CONTENT_WIDTH_PX }}
            >
                <div className="pointer-events-auto flex items-center gap-2">
                    <DebugConsoleToggle />
                    <MusicPlayer />
                </div>
            </div>
        </div>
    );
}
