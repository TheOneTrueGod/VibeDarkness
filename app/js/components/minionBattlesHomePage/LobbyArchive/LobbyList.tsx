import React, { useEffect, useState } from 'react';
import type { LobbyClient, AdminLobbyEntry } from '../../../LobbyClient';

const PAGE_SIZE = 10;

interface LobbyListProps {
    lobbyClient: LobbyClient;
    selectedLobbyId: string | null;
    onSelect: (lobbyId: string) => void;
}

function PlayerCircle({ playerId }: { playerId: string }) {
    const initials = String(playerId).slice(0, 2).toUpperCase();
    return (
        <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface border border-border-custom text-[10px] text-muted shrink-0"
            title={playerId}
        >
            {initials}
        </span>
    );
}

export default function LobbyList({ lobbyClient, selectedLobbyId, onSelect }: LobbyListProps) {
    const [lobbies, setLobbies] = useState<AdminLobbyEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        lobbyClient
            .listAdminLobbies()
            .then((list) => {
                if (!cancelled) setLobbies(list);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load lobbies');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [lobbyClient]);

    const totalPages = Math.max(1, Math.ceil(lobbies.length / PAGE_SIZE));
    const pageLobbies = lobbies.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    if (loading) {
        return <div className="flex-1 flex items-center justify-center text-muted text-sm">Loading…</div>;
    }
    if (error) {
        return <div className="flex-1 flex items-center justify-center text-danger text-sm px-4">{error}</div>;
    }
    if (lobbies.length === 0) {
        return <div className="flex-1 flex items-center justify-center text-muted text-sm">No archived lobbies</div>;
    }

    return (
        <>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
                {pageLobbies.map((lobby) => {
                    const isSelected = lobby.id === selectedLobbyId;
                    const dateStr = lobby.createdAt != null
                        ? new Date(lobby.createdAt * 1000).toLocaleString()
                        : 'Unknown date';
                    return (
                        <button
                            key={lobby.id}
                            type="button"
                            onClick={() => onSelect(lobby.id)}
                            className={`w-full text-left rounded-xl border p-3 transition-colors ${
                                isSelected
                                    ? 'border-primary bg-surface'
                                    : 'border-border-custom bg-surface-light hover:border-primary'
                            }`}
                        >
                            <div className="text-lg font-mono font-bold text-white">{lobby.id}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-muted flex-1 min-w-0 truncate">{dateStr}</span>
                                <div className="flex items-center gap-1 shrink-0">
                                    {lobby.playerIds.slice(0, 8).map((pid) => (
                                        <PlayerCircle key={String(pid)} playerId={String(pid)} />
                                    ))}
                                    {lobby.playerIds.length > 8 && (
                                        <span className="text-[10px] text-muted">+{lobby.playerIds.length - 8}</span>
                                    )}
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
            {totalPages > 1 && (
                <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-border-custom text-xs text-muted">
                    <button
                        type="button"
                        className="px-2 py-1 rounded border border-border-custom bg-surface-light hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={page === 0}
                        onClick={() => setPage((p) => p - 1)}
                    >
                        ← Prev
                    </button>
                    <span>
                        {page + 1} / {totalPages}
                    </span>
                    <button
                        type="button"
                        className="px-2 py-1 rounded border border-border-custom bg-surface-light hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        disabled={page >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                    >
                        Next →
                    </button>
                </div>
            )}
        </>
    );
}
