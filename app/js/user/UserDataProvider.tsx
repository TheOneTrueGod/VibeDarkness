import React, { createContext, useContext } from 'react';
import type { AccountState } from '../types';

interface UserDataContextValue {
    user: AccountState | null;
    loading: boolean;
    refetch: () => Promise<void>;
}

const UserDataContext = createContext<UserDataContextValue | null>(null);

export function UserDataProvider({
    user,
    loading,
    refetch,
    children,
}: {
    user: AccountState | null;
    loading: boolean;
    refetch: () => Promise<void>;
    children: React.ReactNode;
}) {
    return (
        <UserDataContext.Provider value={{ user, loading, refetch }}>
            {children}
        </UserDataContext.Provider>
    );
}

export function useUserData(): UserDataContextValue {
    const ctx = useContext(UserDataContext);
    if (!ctx) throw new Error('useUserData must be used within UserDataProvider');
    return ctx;
}
