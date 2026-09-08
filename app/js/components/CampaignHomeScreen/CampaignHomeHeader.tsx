/**
 * Campaign-home title row: name on the left; debug tab, CI pill, music player,
 * and logout on the right, bottom-aligned with the title.
 * Width matches {@link CAMPAIGN_HOME_CARD_MAX_WIDTH_CLASS} via the parent column.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { useCurrentUser } from '../../user/useCurrentUser';
import { useUserData } from '../../user/UserDataProvider';
import { LobbyClient } from '../../LobbyClient';
import { TestIds } from '../../testing/testIds';
import MusicPlayer from '../../games/minion_battles/ui/components/MusicPlayer';
import CiStatusPill from '../CiStatusPill';
import DebugConsoleToggle from '../DebugConsole/DebugConsoleToggle';

export default function CampaignHomeHeader() {
    const { isAdmin } = useCurrentUser();
    const { refetch } = useUserData();
    const lobbyClient = useMemo(() => new LobbyClient(), []);
    const [loggingOut, setLoggingOut] = useState(false);

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

    return (
        <div className="mb-2 flex items-end justify-between gap-3">
            <h1 className="text-4xl max-md:text-3xl font-bold text-primary shrink-0">
                Minion Battles
            </h1>
            <div className="flex items-end gap-2 shrink-0">
                <DebugConsoleToggle />
                {isAdmin && <CiStatusPill embedded compact />}
                <MusicPlayer />
                <button
                    type="button"
                    data-testid={TestIds.appLogout}
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="px-2 py-0.5 rounded-md border border-border-custom bg-surface-light/90 text-xs leading-5 text-muted hover:text-white hover:bg-border-custom transition-colors disabled:opacity-50"
                >
                    {loggingOut ? 'Logging out…' : 'Log out'}
                </button>
            </div>
        </div>
    );
}
