/**
 * Global title bar shown for authenticated users on campaign screens.
 * In-lobby CI status lives in GameScreen's mission header instead.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '../user/useCurrentUser';
import CiStatusPill from './CiStatusPill';

const LOBBY_PATH_PATTERN = /^\/lobby\//;

export default function AppTitleBar() {
    const location = useLocation();
    const { isAdmin } = useCurrentUser();
    const inLobby = LOBBY_PATH_PATTERN.test(location.pathname);

    if (!isAdmin || inLobby) {
        return null;
    }

    return (
        <div className="pointer-events-none fixed top-0 left-0 right-0 z-[200] flex items-center justify-end px-4 py-2">
            <div className="pointer-events-auto">
                <CiStatusPill />
            </div>
        </div>
    );
}
