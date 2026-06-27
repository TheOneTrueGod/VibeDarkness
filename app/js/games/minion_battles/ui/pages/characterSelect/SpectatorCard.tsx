import React from 'react';

export function SpectatorCard({
    isMySelection,
    onSelect,
}: {
    isMySelection: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`
                w-[200px] h-[200px] rounded-lg border-2 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
                ${isMySelection
                    ? 'border-primary bg-surface-light shadow-[0_0_12px_rgba(78,205,196,0.4)]'
                    : 'border-border-custom bg-surface hover:border-primary hover:bg-surface-light'
                }
            `}
            onClick={onSelect}
            onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        >
            <svg
                className="w-14 h-14 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Spectator</span>
            <span className="text-xs text-muted text-center px-2">Watch without playing</span>
        </div>
    );
}
