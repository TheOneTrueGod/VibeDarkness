import React from 'react';

type Props = {
    secondsRemaining: number;
    totalDuration: number;
};

/** Progress-bar timer shown on the boss HUD while the Exposed debuff is active. */
export function BossExposedTimerBar({ secondsRemaining, totalDuration }: Props) {
    const safeTotal = totalDuration > 0 ? totalDuration : 1;
    const fillPct = Math.min(100, (secondsRemaining / safeTotal) * 100);

    return (
        <div
            className="relative h-6 w-36 overflow-hidden rounded-sm border border-orange-500/70 bg-gray-900/90 shadow-md"
            role="timer"
            aria-label={`Exposed: ${secondsRemaining.toFixed(1)} seconds remaining`}
        >
            <div
                className="absolute inset-y-0 left-0 bg-orange-600/35 transition-[width] duration-100 ease-linear"
                style={{ width: `${fillPct}%` }}
                aria-hidden
            />
            <div className="absolute inset-y-0 left-0 z-10 flex items-center pl-1.5">
                <span className="text-xs font-bold tabular-nums text-orange-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    {secondsRemaining.toFixed(1)}s
                </span>
            </div>
            <div className="relative z-10 flex h-full items-center justify-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-orange-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                    Exposed
                </span>
            </div>
        </div>
    );
}
