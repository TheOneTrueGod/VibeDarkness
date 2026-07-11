/**
 * HeaderSlotLobbyInfo - the Header slot's content: player name/HOST badge, CI status pill
 * (admin only), and lobby name/id. Desktop-only (the mobile GameScreen branch keeps its own header).
 */
import React from 'react';
import CiStatusPill from '../CiStatusPill';
import LobbyIdBadge from '../LobbyIdBadge';

interface HeaderSlotLobbyInfoProps {
    playerName: string;
    isHost: boolean;
    isAdmin: boolean;
    lobbyName: string;
    lobbyId: string;
}

export default function HeaderSlotLobbyInfo({
    playerName,
    isHost,
    isAdmin,
    lobbyName,
    lobbyId,
}: HeaderSlotLobbyInfoProps) {
    return (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 flex items-center gap-2">
                <span className="truncate">{playerName}</span>
                {isHost && (
                    <span className="px-2 py-1 bg-warning text-secondary rounded text-xs font-bold shrink-0">
                        HOST
                    </span>
                )}
            </div>
            <div className="flex-shrink-0 flex items-center justify-center min-w-0 max-w-[50%] sm:max-w-none">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                    {isAdmin ? <CiStatusPill embedded /> : null}
                    <span className="text-lg sm:text-xl font-semibold truncate">{lobbyName}</span>
                    <LobbyIdBadge id={lobbyId} className="hidden sm:inline" />
                </div>
            </div>
            <div className="flex-1" aria-hidden />
        </div>
    );
}
