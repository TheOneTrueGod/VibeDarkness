/**
 * Game selection list - shown when lobby is in 'home' state
 */
import React, { useMemo } from 'react';
import { GAMES } from '../games/list';

interface GameListProps {
    isHost: boolean;
    onSelectGame: (gameId: string) => void;
}

export default function GameList({ isHost, onSelectGame }: GameListProps) {
    const sortedGames = useMemo(
        () => [...GAMES].sort((a, b) => Number(b.enabled) - Number(a.enabled)),
        []
    );

    return (
        <div className="flex-1 overflow-auto p-4 bg-surface rounded-lg">
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5 list-none p-0">
                {sortedGames.map((game) => (
                    <li
                        key={game.id}
                        className={`bg-surface-light rounded p-4 border border-border-custom transition-all ${
                            game.enabled && isHost
                                ? 'cursor-pointer hover:border-primary hover:shadow'
                                : 'cursor-not-allowed opacity-60'
                        }`}
                        onClick={() => {
                            if (game.enabled && isHost) onSelectGame(game.id);
                        }}
                    >
                        {game.image ? (
                            <img
                                src={game.image}
                                alt=""
                                className="w-full aspect-[16/10] object-cover rounded bg-surface"
                            />
                        ) : (
                            <div className="w-full aspect-[16/10] bg-surface rounded" />
                        )}
                        <h3 className="mt-3 mb-2 text-base">{game.title}</h3>
                        <p className="text-[13px] text-muted m-0">{game.description}</p>
                    </li>
                ))}
            </ul>
        </div>
    );
}
