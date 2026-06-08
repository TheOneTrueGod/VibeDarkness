/**
 * Two-line player pill: color dot, name, HOST badge, (You) on line 1;
 * optional second line (e.g. selected character or "(selecting)").
 */
import React from 'react';
import type { PlayerState } from '../types';

interface PlayerPillProps {
    player: PlayerState;
    /** When set, show "(You)" when player.id === currentPlayerId */
    currentPlayerId?: string;
    /** Optional second line (e.g. character name or "(selecting)"). Omit for single-line pill. */
    secondLine?: string | null;
    /** When set (e.g. on character select), show Ready/Not Ready with green/yellow outline. */
    readyStatus?: 'ready' | 'not_ready';
    /** When true, temporarily flash the pill to highlight the player (e.g. WebRTC ping). */
    isFlashing?: boolean;
}

export default function PlayerPill({
    player,
    currentPlayerId,
    secondLine = null,
    readyStatus,
    isFlashing = false,
}: PlayerPillProps) {
    const showYou = currentPlayerId != null && player.id === currentPlayerId;
    const hasSecondLine = secondLine !== undefined;
    const hasReadyStatus = readyStatus !== undefined;
    const borderClass =
        readyStatus === 'ready'
            ? 'border-2 border-green-500'
            : readyStatus === 'not_ready'
              ? 'border-2 border-yellow-500'
              : 'border border-border-custom';

    const baseBgClass = isFlashing ? 'bg-white text-black' : 'bg-surface-light';

    return (
        <div
            className={`flex flex-col justify-center px-4 py-2 rounded-lg ${baseBgClass} w-[260px] ${borderClass} ${
                hasSecondLine || hasReadyStatus ? 'min-h-[3.5rem]' : ''
            } ${player.isConnected === false ? 'opacity-50' : ''}`}
        >
            <div className="flex items-center gap-2">
                <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: player.color }}
                />
                <span className="text-sm font-medium truncate">{player.name}</span>
                {player.isHost && (
                    <span className="text-[10px] px-1 py-0.5 bg-warning text-secondary rounded-sm font-bold shrink-0">
                        HOST
                    </span>
                )}
                {showYou && (
                    <span className="text-xs text-muted shrink-0">(You)</span>
                )}
                {player.isConnected === false && (
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-3 h-3 text-red-400 shrink-0"
                        title="Disconnected"
                        aria-label="Disconnected"
                    >
                        {/* wifi-off: arcs with a slash */}
                        <line x1="1" y1="1" x2="23" y2="23" />
                        <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                        <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                        <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                        <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <circle cx="12" cy="20" r="1" fill="currentColor" />
                    </svg>
                )}
            </div>
            {secondLine !== undefined && (
                <div className="text-sm text-gray-300 truncate mt-0.5 pl-[18px]">
                    {secondLine ?? ''}
                </div>
            )}
            {hasReadyStatus && (
                <div
                    className={`text-xs font-medium mt-0.5 pl-[18px] ${
                        readyStatus === 'ready' ? 'text-green-400' : 'text-yellow-400'
                    }`}
                >
                    {readyStatus === 'ready' ? 'Ready' : 'Not Ready'}
                </div>
            )}
        </div>
    );
}
