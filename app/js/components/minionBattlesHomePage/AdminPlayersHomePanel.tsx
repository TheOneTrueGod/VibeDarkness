/**
 * Admin-only Players panel on the campaign home screen.
 * Shows all registered accounts; clicking one routes to that player's characters page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AccountState } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import PanelLayout from './PanelLayout';
import { playerCharactersPath } from '../ability-tests/campaignTabPaths';

function formatCountdown(seconds: number): string {
    if (seconds <= 0) return '0s';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function AccountCard({
    account,
    onSelect,
    now,
}: {
    account: AccountState;
    onSelect: () => void;
    now: number;
}) {
    const earSecondsLeft = account.emergencyRecoveryExpiresAt
        ? Math.max(0, account.emergencyRecoveryExpiresAt - now)
        : 0;
    const inEAR = earSecondsLeft > 0;

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                inEAR
                    ? 'border-red-500 bg-surface hover:border-red-400'
                    : 'border-border-custom bg-surface hover:border-primary'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{account.name}</p>
                    <p className="text-xs text-muted">{account.role === 'admin' ? 'Admin' : 'Player'}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {inEAR && (
                        <span className="text-[10px] font-bold text-red-400">
                            EAR: {formatCountdown(earSecondsLeft)}
                        </span>
                    )}
                    <div className="rounded-md border border-border-custom bg-dark-700 px-2 py-1 text-xs text-muted">
                        #{account.id}
                    </div>
                </div>
            </div>
        </button>
    );
}

interface AdminPlayersPanelProps {
    lobbyClient: LobbyClient;
}

export default function AdminPlayersHomePanel({ lobbyClient }: AdminPlayersPanelProps) {
    const navigate = useNavigate();
    const [accounts, setAccounts] = useState<AccountState[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(false);
    const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
    const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const sortedAccounts = useMemo(
        () => [...accounts].sort((a, b) => a.name.localeCompare(b.name)),
        [accounts],
    );

    const loadAccounts = useCallback(async () => {
        setAccountsLoading(true);
        try {
            const list = await lobbyClient.listAdminAccounts();
            setAccounts(list as AccountState[]);
        } catch (error) {
            console.error('Failed to load admin accounts list:', error);
            setAccounts([]);
        } finally {
            setAccountsLoading(false);
        }
    }, [lobbyClient]);

    useEffect(() => {
        void loadAccounts();
    }, [loadAccounts]);

    // EAR ticker for cards that show an active countdown
    useEffect(() => {
        const anyEAR = accounts.some(
            (a) => a.emergencyRecoveryExpiresAt && a.emergencyRecoveryExpiresAt > now,
        );
        if (anyEAR) {
            if (tickerRef.current === null) {
                tickerRef.current = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
            }
        } else {
            if (tickerRef.current !== null) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        }
        return () => {};
    }, [accounts, now]);

    useEffect(() => {
        return () => {
            if (tickerRef.current !== null) clearInterval(tickerRef.current);
        };
    }, []);

    return (
        <PanelLayout
            title="Players"
            subtitle="Admin overview for all accounts"
            actions={
                <button
                    type="button"
                    onClick={() => void loadAccounts()}
                    className="rounded-lg border border-border-custom bg-surface-light px-4 py-2 text-sm font-medium text-white hover:bg-border-custom disabled:opacity-60"
                    disabled={accountsLoading}
                >
                    {accountsLoading ? 'Refreshing…' : 'Refresh'}
                </button>
            }
            center={
                <div className="p-5 h-full overflow-y-auto">
                    {accountsLoading && sortedAccounts.length === 0 && (
                        <div className="text-sm text-muted">Loading accounts…</div>
                    )}
                    {!accountsLoading && sortedAccounts.length === 0 && (
                        <div className="text-sm text-muted">No accounts found</div>
                    )}
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
                        {sortedAccounts.map((account) => (
                            <AccountCard
                                key={account.id}
                                account={account}
                                onSelect={() => navigate(playerCharactersPath(account.id))}
                                now={now}
                            />
                        ))}
                    </div>
                </div>
            }
            centerClassName="overflow-hidden"
        />
    );
}
