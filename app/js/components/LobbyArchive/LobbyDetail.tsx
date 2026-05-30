import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LobbyClient } from '../../LobbyClient';
import ArchiveGameStateTab from './tabs/ArchiveGameStateTab';
import ArchiveLobbyLogTab from './tabs/ArchiveLobbyLogTab';
import ArchiveUserStatesTab from './tabs/ArchiveUserStatesTab';

type DetailTab = 'game_state' | 'lobby_log' | 'user_states';

const VALID_TABS: DetailTab[] = ['game_state', 'lobby_log', 'user_states'];

interface LobbyDetailProps {
    lobbyId: string;
    lobbyClient: LobbyClient;
    onJoinLobby: (lobbyId: string) => Promise<void>;
}

const TABS: { id: DetailTab; label: string }[] = [
    { id: 'game_state', label: 'Game State' },
    { id: 'lobby_log', label: 'Lobby Log' },
    { id: 'user_states', label: 'User States' },
];

export default function LobbyDetail({ lobbyId, lobbyClient, onJoinLobby }: LobbyDetailProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [clearingLog, setClearingLog] = useState(false);
    const [logCleared, setLogCleared] = useState(false);
    const [joining, setJoining] = useState(false);

    const tabParam = searchParams.get('tab');
    const activeTab: DetailTab = VALID_TABS.includes(tabParam as DetailTab) ? (tabParam as DetailTab) : 'game_state';

    const handleSetTab = (tab: DetailTab) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('tab', tab);
                next.delete('batch');
                next.delete('tick');
                return next;
            },
            { replace: true },
        );
    };

    const handleClearLog = async () => {
        const confirmed = window.confirm(`Delete lobby log for ${lobbyId}? This cannot be undone.`);
        if (!confirmed) return;
        setClearingLog(true);
        try {
            await lobbyClient.deleteAdminLobbyLog(lobbyId);
            setLogCleared(true);
            window.setTimeout(() => setLogCleared(false), 2000);
        } finally {
            setClearingLog(false);
        }
    };

    const handleRejoin = async () => {
        setJoining(true);
        try {
            await onJoinLobby(lobbyId);
        } finally {
            setJoining(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
            <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-border-custom">
                <span className="text-sm font-mono font-semibold text-white">{lobbyId}</span>
                <div className="flex gap-2 ml-auto">
                    <button
                        type="button"
                        className="px-3 py-1.5 text-xs rounded border border-red-700 bg-red-900/40 text-red-300 hover:bg-red-900/60 disabled:opacity-50 transition-colors"
                        disabled={clearingLog}
                        onClick={() => void handleClearLog()}
                    >
                        {logCleared ? 'Log Cleared' : clearingLog ? 'Clearing…' : 'Clear Lobby Log'}
                    </button>
                    <button
                        type="button"
                        className="px-3 py-1.5 text-xs rounded border border-green-700 bg-green-900/40 text-green-300 hover:bg-green-900/60 disabled:opacity-50 transition-colors"
                        disabled={joining}
                        onClick={() => void handleRejoin()}
                    >
                        {joining ? 'Joining…' : 'Rejoin Lobby'}
                    </button>
                </div>
            </div>

            <div className="shrink-0 flex border-b border-border-custom">
                {TABS.map(({ id, label }) => (
                    <button
                        key={id}
                        type="button"
                        className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                            activeTab === id
                                ? 'text-primary border-primary'
                                : 'text-muted border-transparent hover:text-white'
                        }`}
                        onClick={() => handleSetTab(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* Each tab manages its own scroll so ArchiveUserStatesTab can have sticky inner headers. */}
            {activeTab === 'game_state' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <ArchiveGameStateTab isActive lobbyId={lobbyId} lobbyClient={lobbyClient} />
                </div>
            )}
            {activeTab === 'lobby_log' && (
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <ArchiveLobbyLogTab isActive lobbyId={lobbyId} lobbyClient={lobbyClient} logCleared={logCleared} />
                </div>
            )}
            {activeTab === 'user_states' && (
                <ArchiveUserStatesTab isActive lobbyId={lobbyId} lobbyClient={lobbyClient} />
            )}
        </div>
    );
}
