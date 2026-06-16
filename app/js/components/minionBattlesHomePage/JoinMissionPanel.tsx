import React, { useCallback, useEffect, useState } from 'react';
import type { LobbyClient } from '../../LobbyClient';
import RecentLobbiesList, { type RecentLobbyInfo } from '../RecentLobbiesList';
import PanelLayout from './PanelLayout';

interface JoinMissionPanelProps {
    lobbyClient: LobbyClient;
    onJoinLobby: (lobbyId: string) => Promise<void>;
}

export default function JoinMissionPanel({ lobbyClient, onJoinLobby }: JoinMissionPanelProps) {
    const [lobbyCode, setLobbyCode] = useState('');
    const [recentLobbyInfos, setRecentLobbyInfos] = useState<RecentLobbyInfo[]>([]);

    useEffect(() => {
        let cancelled = false;

        const fetchLobbies = async () => {
            const list = await lobbyClient.getActiveLobbies();
            if (cancelled) return;
            const infos: RecentLobbyInfo[] = list.map((entry) => ({
                id: entry.lobby_id,
                name: entry.name ?? entry.lobby_id,
                lobbyState: (entry.lobbyState as 'home' | 'in_game') ?? 'home',
                gameType: entry.gameType ?? null,
                playerCount: entry.player_ids?.length ?? 0,
            }));
            setRecentLobbyInfos((prev) => {
                const existingIds = new Set(prev.map((l) => l.id));
                const newLobbies = infos.filter((l) => !existingIds.has(l.id));
                return newLobbies.length > 0 ? [...prev, ...newLobbies] : prev;
            });
        };

        void fetchLobbies();
        const intervalId = setInterval(() => { void fetchLobbies(); }, 1000);
        return () => {
            cancelled = true;
            clearInterval(intervalId);
        };
    }, [lobbyClient]);

    const handleJoinByCode = useCallback(async () => {
        const code = lobbyCode.trim().toUpperCase();
        if (!code) return;
        await onJoinLobby(code);
    }, [lobbyCode, onJoinLobby]);

    return (
        <PanelLayout
            title="Join Mission"
            center={
                <div className="p-6">
                    <input
                        type="text"
                        className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted mb-3"
                        placeholder="Enter lobby code"
                        maxLength={6}
                        value={lobbyCode}
                        onChange={(e) => setLobbyCode(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && void handleJoinByCode()}
                    />
                    <button
                        className="px-6 py-3 bg-surface-light text-white font-semibold text-base rounded border border-border-custom hover:bg-border-custom transition-colors"
                        onClick={() => void handleJoinByCode()}
                    >
                        Join by Code
                    </button>
                    <RecentLobbiesList lobbies={recentLobbyInfos} onJoin={onJoinLobby} />
                </div>
            }
        />
    );
}
