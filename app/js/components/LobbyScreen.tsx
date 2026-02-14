/**
 * Lobby screen - create or join a lobby
 */
import React, { useState, useEffect } from 'react';
import LobbyList from './LobbyList';
import type { LobbyListItem } from './LobbyList';
import { LobbyClient } from '../LobbyClient';

interface LobbyScreenProps {
    lobbyClient: LobbyClient;
    storedPlayerName: string;
    onCreateLobby: (playerName: string, lobbyName: string) => Promise<void>;
    onJoinLobby: (playerName: string, lobbyId: string) => Promise<void>;
}

export default function LobbyScreen({
    lobbyClient,
    storedPlayerName,
    onCreateLobby,
    onJoinLobby,
}: LobbyScreenProps) {
    const [playerName, setPlayerName] = useState(storedPlayerName);
    const [lobbyName, setLobbyName] = useState('');
    const [lobbyCode, setLobbyCode] = useState('');
    const [lobbies, setLobbies] = useState<LobbyListItem[]>([]);
    const [creating, setCreating] = useState(false);

    const loadLobbies = async () => {
        try {
            const list = await lobbyClient.listLobbies();
            setLobbies(list as LobbyListItem[]);
        } catch (err) {
            console.error('Failed to load lobbies:', err);
        }
    };

    useEffect(() => {
        loadLobbies();
    }, []);

    const handleCreate = async () => {
        if (!playerName.trim() || !lobbyName.trim()) return;
        setCreating(true);
        try {
            await onCreateLobby(playerName.trim(), lobbyName.trim());
        } finally {
            setCreating(false);
        }
    };

    const handleJoinByCode = async () => {
        const code = lobbyCode.trim().toUpperCase();
        if (!playerName.trim() || !code) return;
        await onJoinLobby(playerName.trim(), code);
    };

    const handleJoinFromList = async (lobbyId: string) => {
        if (!playerName.trim()) return;
        await onJoinLobby(playerName.trim(), lobbyId);
    };

    return (
        <div className="min-h-screen">
            <div className="max-w-[600px] mx-auto px-5 py-10 max-md:px-5 max-md:py-5">
                <h1 className="text-center text-4xl max-md:text-3xl font-bold mb-10 text-primary">
                    Multiplayer Game
                </h1>

                {/* Player Name */}
                <div className="mb-8">
                    <label className="block mb-2 font-semibold" htmlFor="player-name">
                        Your Name
                    </label>
                    <input
                        id="player-name"
                        type="text"
                        className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted"
                        placeholder="Enter your name"
                        maxLength={20}
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                    />
                </div>

                {/* Create / Join */}
                <div className="bg-surface rounded-lg p-6 mb-8">
                    {/* Create */}
                    <div className="flex flex-col gap-3">
                        <h2 className="text-lg text-muted">Create a Lobby</h2>
                        <input
                            type="text"
                            className="w-full px-4 py-3 border border-border-custom rounded bg-surface-light text-white text-base focus:outline-none focus:border-primary placeholder:text-muted"
                            placeholder="Lobby name"
                            maxLength={30}
                            value={lobbyName}
                            onChange={(e) => setLobbyName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                        />
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

                {/* Public lobbies */}
                <div className="bg-surface rounded-lg p-6">
                    <h2 className="text-lg mb-4">Public Lobbies</h2>
                    <LobbyList lobbies={lobbies} onJoin={handleJoinFromList} />
                    <button
                        className="px-4 py-2 bg-surface-light text-white font-semibold text-sm rounded border border-border-custom hover:bg-border-custom transition-colors"
                        onClick={loadLobbies}
                    >
                        Refresh
                    </button>
                </div>
            </div>
        </div>
    );
}
