import React from 'react';
import type { PlayerState } from '../../../../../types';

export function PlayerCard({
    player,
    selected,
    onSelect,
}: {
    player: PlayerState;
    selected: boolean;
    onSelect: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                selected
                    ? 'border-primary bg-surface-light shadow-[0_0_0_1px_rgba(78,205,196,0.2)]'
                    : 'border-border-custom bg-surface hover:border-primary'
            }`}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{player.name}</p>
                    <p className="text-xs text-muted">{player.isHost ? 'Host' : 'Player'}</p>
                </div>
                <div className="w-4 h-4 rounded-full border border-white/40 shrink-0" style={{ backgroundColor: player.color }} />
            </div>
        </button>
    );
}
