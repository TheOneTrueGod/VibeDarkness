/**
 * Login / account creation screen
 */
import React, { useState, useEffect } from 'react';
import type { AccountState } from '../types';

const USERNAME_STORAGE_KEY = 'loginUsername';

function getStoredUsername(): string {
    try {
        const name = localStorage.getItem(USERNAME_STORAGE_KEY);
        return name?.trim() || '';
    } catch {
        return '';
    }
}

function saveUsername(username: string): void {
    const trimmed = username.trim();
    if (!trimmed) return;
    try {
        localStorage.setItem(USERNAME_STORAGE_KEY, trimmed);
    } catch {
        // ignore
    }
}

interface LoginScreenProps {
    onLogin: (account: AccountState) => void;
    lobbyClient: { login: (u: string, p: string) => Promise<AccountState>; createAccount: (u: string, p: string) => Promise<AccountState> };
}

export default function LoginScreen({ onLogin, lobbyClient }: LoginScreenProps) {
    const [username, setUsername] = useState(getStoredUsername);
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState<'login' | 'create'>('login');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setUsername(getStoredUsername());
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!username.trim()) {
            setError('Username is required');
            return;
        }
        if (!password) {
            setError('Password is required');
            return;
        }
        setLoading(true);
        try {
            const account =
                mode === 'login'
                    ? await lobbyClient.login(username.trim(), password)
                    : await lobbyClient.createAccount(username.trim(), password);
            saveUsername(username.trim());
            onLogin(account);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <h1 className="text-center text-4xl font-bold mb-8 text-primary">
                    Multiplayer Game
                </h1>

                <div className="bg-surface rounded-lg p-6">
                    <h2 className="text-lg font-semibold mb-4">
                        {mode === 'login' ? 'Log in' : 'Create account'}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block mb-1 text-sm font-medium text-muted" htmlFor="username">
                                Username
                            </label>
                            <input
                                id="username"
                                type="text"
                                className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted"
                                placeholder="Enter username"
                                maxLength={20}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className="block mb-1 text-sm font-medium text-muted" htmlFor="password">
                                Password
                            </label>
                            <input
                                id="password"
                                type="password"
                                className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted"
                                placeholder="Enter password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                            />
                        </div>
                        {error && (
                            <p className="text-red-500 text-sm">{error}</p>
                        )}
                        <div className="flex flex-col gap-2">
                            <button
                                type="submit"
                                className="w-full px-6 py-3 bg-primary text-secondary font-semibold text-base rounded hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={loading}
                            >
                                {mode === 'login' ? 'Log in' : 'Create account'}
                            </button>
                            <button
                                type="button"
                                className="w-full px-4 py-2 text-muted hover:text-white text-sm transition-colors"
                                onClick={() => {
                                    setMode((m) => (m === 'login' ? 'create' : 'login'));
                                    setError('');
                                }}
                            >
                                {mode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Log in'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
