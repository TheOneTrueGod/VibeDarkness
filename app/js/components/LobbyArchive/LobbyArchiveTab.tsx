import React, { useState } from 'react';
import type { LobbyClient } from '../../LobbyClient';
import LobbyList from './LobbyList';
import LobbyDetail from './LobbyDetail';

interface LobbyArchiveTabProps {
    lobbyClient: LobbyClient;
    onJoinLobby: (lobbyId: string) => Promise<void>;
}

export default function LobbyArchiveTab({ lobbyClient, onJoinLobby }: LobbyArchiveTabProps) {
    const [selectedLobbyId, setSelectedLobbyId] = useState<string | null>(null);

    return (
        <div className="flex flex-row overflow-hidden rounded-lg border border-border-custom bg-surface" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
            <div className="w-80 shrink-0 flex flex-col border-r border-border-custom">
                <div className="px-4 py-3 border-b border-border-custom">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Lobby Archive</h2>
                </div>
                <LobbyList
                    lobbyClient={lobbyClient}
                    selectedLobbyId={selectedLobbyId}
                    onSelect={setSelectedLobbyId}
                />
            </div>
            <div className="flex-1 min-w-0 flex flex-col">
                {selectedLobbyId != null ? (
                    <LobbyDetail
                        key={selectedLobbyId}
                        lobbyId={selectedLobbyId}
                        lobbyClient={lobbyClient}
                        onJoinLobby={onJoinLobby}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-muted text-sm">
                        Select a lobby to inspect
                    </div>
                )}
            </div>
        </div>
    );
}
