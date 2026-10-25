import React, { useMemo, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useUserData } from '../user/UserDataProvider';
import { useCurrentUser } from '../user/useCurrentUser';
import LoginScreen from '../components/LoginScreen';
import AppTitleBar from '../components/AppTitleBar';
import { LobbyClient } from '../LobbyClient';
import type { AccountState } from '../types';
import { campaignPathForTab } from '../components/ability-tests/campaignTabPaths';

function getNextRedirect(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next');
    return next && next.startsWith('/') ? next : '/';
}

/** Auth gate: redirects unauthenticated users, shows LoginScreen or children */
export function AuthGate({ children }: { children: React.ReactNode }) {
    const { user, loading, refetch } = useUserData();
    const lobbyClient = useMemo(() => new LobbyClient(), []);

    const handleLogin = useCallback(
        async (_account: AccountState) => {
            await refetch();
            const next = getNextRedirect();
            window.location.href = next;
        },
        [refetch]
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center text-muted">
                Loading...
            </div>
        );
    }

    if (!user) {
        const path = window.location.pathname;
        if (path !== '/' && path !== '/index.html') {
            const next = encodeURIComponent(path + window.location.search);
            window.location.replace('/?next=' + next);
            return null;
        }
        return <LoginScreen lobbyClient={lobbyClient} onLogin={handleLogin} />;
    }

    return (
        <>
            <AppTitleBar />
            {children}
        </>
    );
}

/** Default campaign home after login or unknown `/` path. */
export function CampaignIndexRedirect() {
    const { isAdmin } = useCurrentUser();
    return <Navigate to={isAdmin ? campaignPathForTab('mission_select') : campaignPathForTab('join_mission')} replace />;
}
