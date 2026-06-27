import React from 'react';

export function ControlEnemyCard({
    isMySelection,
    isDisabled,
    onSelect,
}: {
    isMySelection: boolean;
    isDisabled: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`
                w-[200px] h-[200px] rounded-lg border-2 flex flex-col items-center justify-center gap-3 transition-all
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${isMySelection
                    ? 'border-red-500 bg-red-950/40 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                    : 'border-red-700/70 bg-surface hover:border-red-500 hover:bg-red-950/20'
                }
            `}
            onClick={() => !isDisabled && onSelect()}
            onKeyDown={(e) => e.key === 'Enter' && !isDisabled && onSelect()}
            title={isDisabled ? 'Another player is controlling the Alpha Wolf' : 'Control the Alpha Wolf'}
        >
            <svg
                className="w-14 h-14 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
            </svg>
            <span className="text-sm font-semibold text-red-300">Control Alpha Wolf</span>
            <span className="text-xs text-red-400/80 text-center px-2">Play as the boss</span>
        </div>
    );
}
