import React, { useState, useEffect, useCallback } from 'react';
import type { AccountState } from '../types';
import { UserDataProvider } from './UserDataProvider';

interface UserDataLoaderProps {
    lobbyClient: { getMe: () => Promise<AccountState | null> };
    /** Pre-loaded user data; skips the initial fetch when provided (for future SSR hydration). */
    initialUser?: AccountState | null;
    children: React.ReactNode;
}

export function UserDataLoader({ lobbyClient, initialUser, children }: UserDataLoaderProps) {
    const [user, setUser] = useState<AccountState | null>(initialUser ?? null);
    const [loading, setLoading] = useState(initialUser === undefined);

    const fetchUser = useCallback(async () => {
        try {
            const u = await lobbyClient.getMe();
            setUser(u);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [lobbyClient]);

    useEffect(() => {
        if (initialUser === undefined) {
            fetchUser();
        }
    }, [fetchUser, initialUser]);

    return (
        <UserDataProvider user={user} loading={loading} refetch={fetchUser}>
            {children}
        </UserDataProvider>
    );
}
