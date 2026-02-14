/**
 * Lobby list rendering component
 */
import React from 'react';

export interface LobbyListItem {
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
}

interface LobbyListProps {
    lobbies: LobbyListItem[];
    onJoin: (lobbyId: string) => void;
}

export default function LobbyList({ lobbies, onJoin }: LobbyListProps) {
    if (lobbies.length === 0) {
        return <p className="text-muted text-center py-5">No public lobbies available</p>;
    }

    return (
        <div className="max-h-[300px] overflow-y-auto mb-4">
            {lobbies.map((lobby) => (
                <div
                    key={lobby.id}
                    className="flex justify-between items-center px-4 py-3 bg-surface-light rounded mb-2 transition-colors hover:bg-border-custom"
                >
                    <div className="flex flex-col">
                        <span className="font-semibold">{lobby.name}</span>
                        <span className="text-sm text-muted">
                            {lobby.playerCount}/{lobby.maxPlayers} players
                        </span>
                    </div>
                    <button
                        className="px-4 py-2 bg-primary text-secondary font-semibold text-sm rounded hover:bg-primary-hover transition-all hover:-translate-y-0.5 hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        disabled={lobby.playerCount >= lobby.maxPlayers}
                        onClick={() => onJoin(lobby.id)}
                    >
                        Join
                    </button>
                </div>
            ))}
        </div>
    );
}
