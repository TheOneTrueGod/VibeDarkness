/**
 * Player list display component
 */
import React from 'react';
import type { PlayerState } from '../types';

interface PlayerListProps {
    players: Record<string, PlayerState>;
    currentPlayerId?: string;
}

export default function PlayerList({ players, currentPlayerId }: PlayerListProps) {
    return (
        <div className="mt-4 p-4 bg-surface rounded">
            <h3 className="mb-3 text-sm text-muted uppercase">Players</h3>
            <ul className="list-none flex flex-wrap gap-2">
                {Object.values(players).map((player) => (
                    <li
                        key={player.id}
                        className={`flex items-center gap-2 px-3 py-1.5 bg-surface-light rounded-full text-sm ${
                            player.isConnected === false ? 'opacity-50' : ''
                        }`}
                    >
                        <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: player.color }}
                        />
                        <span>{player.name}</span>
                        {player.isHost && (
                            <span className="text-[10px] px-1 py-0.5 bg-warning text-secondary rounded-sm font-bold">
                                HOST
                            </span>
                        )}
                        {player.id === currentPlayerId && ' (You)'}
                    </li>
                ))}
            </ul>
        </div>
    );
}
