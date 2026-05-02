import React from 'react';

interface PreMissionStoryEndScreenProps {
    isHost: boolean;
    hostCanStart: boolean;
    singlePlayer: boolean;
    onStartGame: () => void;
}

export default function PreMissionStoryEndScreen({
    isHost,
    hostCanStart,
    singlePlayer,
    onStartGame,
}: PreMissionStoryEndScreenProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-surface">
            {isHost ? (
                <div className="flex flex-col items-center gap-2">
                    <button
                        type="button"
                        onClick={onStartGame}
                        disabled={!hostCanStart}
                        className="px-8 py-3 text-white text-lg font-bold rounded-lg bg-green-600 hover:bg-green-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
                    >
                        Start Game
                    </button>
                    {!hostCanStart && !singlePlayer && <p className="text-muted text-lg">Waiting for players</p>}
                </div>
            ) : (
                <p className="text-muted text-lg">Waiting for host</p>
            )}
        </div>
    );
}
