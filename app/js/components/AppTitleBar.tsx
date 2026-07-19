/**
 * Global title bar shown for authenticated users on campaign screens.
 * In-lobby CI status lives in GameScreen's mission header instead.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '../user/useCurrentUser';
import { useUserData } from '../user/UserDataProvider';
import { LobbyClient } from '../LobbyClient';
import { TestIds } from '../testing/testIds';
import CiStatusPill from './CiStatusPill';

const LOBBY_PATH_PATTERN = /^\/lobby\//;

export default function AppTitleBar() {
    const location = useLocation();
    const { isAdmin } = useCurrentUser();
    const { refetch } = useUserData();
    const lobbyClient = useMemo(() => new LobbyClient(), []);
    const [loggingOut, setLoggingOut] = useState(false);
    const inLobby = LOBBY_PATH_PATTERN.test(location.pathname);

    const handleLogout = useCallback(async () => {
        setLoggingOut(true);
        try {
            await lobbyClient.logout();
            await refetch();
            window.location.href = '/';
        } catch {
            setLoggingOut(false);
        }
    }, [lobbyClient, refetch]);

    // Lobby chrome has its own Leave control; keep this bar for campaign screens.
    if (inLobby) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-[200] flex items-center justify-end px-4 py-2">
            <div className="pointer-events-auto flex items-center gap-2">
                {isAdmin && <CiStatusPill />}
                <button
                    type="button"
                    data-testid={TestIds.appLogout}
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="px-3 py-1.5 rounded-md border border-border-custom bg-surface-light/90 text-sm text-muted hover:text-white hover:bg-border-custom transition-colors disabled:opacity-50"
                >
                    {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
            </div>
        </div>
    );
}
