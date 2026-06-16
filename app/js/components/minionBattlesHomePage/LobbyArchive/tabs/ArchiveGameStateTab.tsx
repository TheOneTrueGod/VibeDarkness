import React, { useEffect, useState } from 'react';
import type { LobbyClient } from '../../../../LobbyClient';
import DebugJsonBlock from '../../../DebugConsole/DebugJsonBlock';

interface ArchiveGameStateTabProps {
    isActive: boolean;
    lobbyId: string;
    lobbyClient: LobbyClient;
}

export default function ArchiveGameStateTab({ isActive, lobbyId, lobbyClient }: ArchiveGameStateTabProps) {
    const [gameState, setGameState] = useState<unknown>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isActive) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        lobbyClient
            .getLobbyState(lobbyId, '')
            .then((result) => {
                if (!cancelled) setGameState(result.gameState);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load game state');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isActive, lobbyId, lobbyClient]);

    if (!isActive) return null;

    if (loading) return <div className="text-muted text-sm">Loading…</div>;
    if (error) return <div className="text-danger text-sm">{error}</div>;

    return <DebugJsonBlock value={gameState} emptyText="No game state available." />;
}
