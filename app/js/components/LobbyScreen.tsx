/**
 * Lobby screen - create or join a lobby (home page for logged-in users)
 */
import React, { useState } from 'react';
import { LobbyClient } from '../LobbyClient';

interface LobbyScreenProps {
    lobbyClient: LobbyClient;
    onCreateLobby: () => Promise<void>;
    onJoinLobby: (lobbyId: string) => Promise<void>;
}

export default function LobbyScreen({
    lobbyClient,
    onCreateLobby,
    onJoinLobby,
}: LobbyScreenProps) {
    const [lobbyCode, setLobbyCode] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreate = async () => {
        setCreating(true);
        try {
            await onCreateLobby();
        } finally {
            setCreating(false);
        }
    };

    const handleJoinByCode = async () => {
        const code = lobbyCode.trim().toUpperCase();
        if (!code) return;
        await onJoinLobby(code);
    };

    return (
        <div className="min-h-screen">
            <div className="max-w-[600px] mx-auto px-5 py-10 max-md:px-5 max-md:py-5">
                <h1 className="text-center text-4xl max-md:text-3xl font-bold mb-10 text-primary">
                    Multiplayer Game
                </h1>

                <div className="bg-surface rounded-lg p-6">
                    {/* Create */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-lg text-muted">Create a Lobby</h2>
                        <button
                            className="px-6 py-3 bg-primary text-secondary font-semibold text-base rounded hover:bg-primary-hover transition-all hover:-translate-y-0.5 hover:shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            onClick={handleCreate}
                            disabled={creating}
                        >
                            Create Lobby
                        </button>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center my-6 text-muted">
                        <div className="flex-1 h-px bg-border-custom" />
                        <span className="px-4">OR</span>
                        <div className="flex-1 h-px bg-border-custom" />
                    </div>

                    {/* Join by code */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-lg text-muted">Join a Lobby</h2>
                        <input
                            type="text"
                            className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted"
                            placeholder="Enter lobby code"
                            maxLength={6}
                            value={lobbyCode}
                            onChange={(e) => setLobbyCode(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
                        />
                        <button
                            className="px-6 py-3 bg-surface-light text-white font-semibold text-base rounded border border-border-custom hover:bg-border-custom transition-colors"
                            onClick={handleJoinByCode}
                        >
                            Join by Code
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
