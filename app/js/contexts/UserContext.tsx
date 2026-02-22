/**
 * User context - provides current user and role across the app.
 * Fetches once on mount and caches; no refetch.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { AccountState } from '../types';

interface UserContextValue {
    user: AccountState | null;
    role: 'user' | 'admin' | null;
    loading: boolean;
    refetch: () => Promise<void>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({
    children,
    lobbyClient,
}: {
    children: React.ReactNode;
    lobbyClient: { getMe: () => Promise<AccountState | null> };
}) {
    const [user, setUser] = useState<AccountState | null>(null);
    const [loading, setLoading] = useState(true);

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
        fetchUser();
    }, [fetchUser]);

    const value: UserContextValue = {
        user,
        role: user?.role ?? null,
        loading,
        refetch: fetchUser,
    };

    return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
    const ctx = useContext(UserContext);
    if (!ctx) {
        throw new Error('useUser must be used within UserProvider');
    }
    return ctx;
}
