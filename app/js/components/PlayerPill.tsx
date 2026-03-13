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
}

export default function PlayerPill({
    player,
    currentPlayerId,
    secondLine = null,
    readyStatus,
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
    return (
        <div
            className={`flex flex-col justify-center px-4 py-2 rounded-lg bg-surface-light w-[260px] ${borderClass} ${
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
