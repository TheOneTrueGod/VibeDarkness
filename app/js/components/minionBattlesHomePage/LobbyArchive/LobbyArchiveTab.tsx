import React from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LobbyClient } from '../../../LobbyClient';
import LobbyList from './LobbyList';
import LobbyDetail from './LobbyDetail';
import PanelLayout from '../PanelLayout';

interface LobbyArchiveTabProps {
    lobbyClient: LobbyClient;
    onJoinLobby: (lobbyId: string) => Promise<void>;
}

export default function LobbyArchiveTab({ lobbyClient, onJoinLobby }: LobbyArchiveTabProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const selectedLobbyId = searchParams.get('lobby');

    const handleSelect = (lobbyId: string) => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.set('lobby', lobbyId);
                next.delete('tab');
                next.delete('batch');
                next.delete('tick');
                return next;
            },
            { replace: true },
        );
    };

    return (
        <PanelLayout
            title="Lobby Archive"
            left={
                <LobbyList
                    lobbyClient={lobbyClient}
                    selectedLobbyId={selectedLobbyId}
                    onSelect={handleSelect}
                />
            }
            leftSize="medium"
            leftClassName="flex flex-col overflow-hidden"
            center={
                selectedLobbyId != null ? (
                    <LobbyDetail
                        key={selectedLobbyId}
                        lobbyId={selectedLobbyId}
                        lobbyClient={lobbyClient}
                        onJoinLobby={onJoinLobby}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-muted text-sm">
                        Select a lobby to inspect
                    </div>
                )
            }
            centerClassName="flex flex-col overflow-hidden"
        />
    );
}
