/**
 * List of active lobbies (lobbies that had a get-state call in the last 10 minutes)
 */
import React from 'react';
import LobbyIdBadge from './LobbyIdBadge';

export interface RecentLobbyInfo {
    id: string;
    name: string;
    lobbyState: 'home' | 'in_game';
    gameType?: string | null;
    playerCount: number;
    /** Resolved mission title, when the lobby has a selected mission. */
    missionName?: string | null;
    /** Display name of the player hosting the lobby. */
    hostPlayerName?: string | null;
}

interface RecentLobbiesListProps {
    lobbies: RecentLobbyInfo[];
    onJoin: (lobbyId: string) => void;
}

function PlayerDots({ count }: { count: number }) {
    const maxVisible = 5;
    const showDots = Math.min(count, maxVisible);
    const extra = count > maxVisible ? count - 4 : 0; // show 4 dots + "+N" when >4

    return (
        <div className="flex items-center gap-0.5 shrink-0">
            {extra > 0 ? (
                <>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-green-500"
                            aria-hidden
                        />
                    ))}
                    <span className="text-xs text-muted ml-0.5">+{extra}</span>
                </>
            ) : (
                Array.from({ length: showDots }).map((_, i) => (
                    <div
                        key={i}
                        className="w-2 h-2 rounded-full bg-green-500"
                        aria-hidden
                    />
                ))
            )}
        </div>
    );
}

function lobbyTitle(info: RecentLobbyInfo): string {
    const mission = info.missionName?.trim();
    if (mission) return mission;
    return info.name;
}

export default function RecentLobbiesList({ lobbies, onJoin }: RecentLobbiesListProps) {
    if (lobbies.length === 0) return null;

    return (
        <div data-className="RecentLobbiesList" className="mt-6">
            <h2 className="text-lg text-muted mb-3">Active Lobbies</h2>
            <ul className="space-y-2">
                {lobbies.map((lobby) => (
                    <li
                        key={lobby.id}
                        className="flex items-center gap-3 px-4 py-3 bg-surface-light rounded-lg"
                    >
                        <LobbyIdBadge id={lobby.id} />
                        <div className="flex flex-col flex-1 min-w-0">
                            <span className="text-sm text-white truncate">{lobbyTitle(lobby)}</span>
                            {lobby.hostPlayerName ? (
                                <span className="text-xs text-muted truncate">
                                    Hosted by {lobby.hostPlayerName}
                                </span>
                            ) : null}
                        </div>
                        <PlayerDots count={lobby.playerCount} />
                        <button
                            type="button"
                            className="px-4 py-2 bg-primary text-secondary font-semibold text-sm rounded hover:bg-primary-hover transition-colors shrink-0"
                            onClick={() => onJoin(lobby.id)}
                        >
                            Join
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}
