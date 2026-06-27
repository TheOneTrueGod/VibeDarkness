import React from 'react';

export function RequiredPlayerSlot({ playerName }: { playerName: string }) {
    return (
        <div
            className="w-[200px] h-[200px] rounded-lg border-2 border-dashed border-yellow-600/50 bg-surface flex flex-col items-center justify-center gap-3 opacity-60"
            title={`Waiting for ${playerName} to join`}
        >
            <svg
                className="w-14 h-14 text-yellow-500/70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 11c2.21 0 4-1.79 4-4S14.21 3 12 3 8 4.79 8 7s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
            </svg>
            <span className="text-sm font-semibold text-yellow-300/80">{playerName}</span>
            <span className="text-xs text-yellow-500/60 text-center px-2">Waiting to join…</span>
        </div>
    );
}
