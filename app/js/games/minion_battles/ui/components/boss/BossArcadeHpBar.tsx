import React from 'react';

type BossArcadeHpBarProps = {
    hp: number;
    maxHp: number;
};

/**
 * Arcade-style readout: two-digit percentage (99 = full) plus a wide red fill for true HP fraction.
 */
export function BossArcadeHpBar({ hp, maxHp }: BossArcadeHpBarProps) {
    const safeMax = maxHp > 0 ? maxHp : 1;
    const ratio = Math.min(1, Math.max(0, hp / safeMax));
    const displayPct = Math.min(99, Math.floor(ratio * 100));
    const tens = Math.floor(displayPct / 10);
    const ones = displayPct % 10;
    const fillWidthPct = ratio * 100;

    return (
        <div className="flex min-h-[3.25rem] flex-row items-stretch gap-3 sm:gap-4">
            <div
                className="flex shrink-0 select-none flex-row items-center tabular-nums"
                aria-label={`Boss health about ${displayPct} percent`}
            >
                <span
                    className={`text-[2.75rem] font-black leading-none tracking-tight sm:text-5xl ${
                        tens === 0 ? 'text-gray-100/25' : 'text-gray-100'
                    }`}
                >
                    {tens}
                </span>
                <span className="text-[2.75rem] font-black leading-none tracking-tight text-gray-100 sm:text-5xl">
                    {ones}
                </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
                <div className="h-10 w-full overflow-hidden rounded-sm border-2 border-red-950 bg-red-950/90 sm:h-12">
                    <div
                        className="h-full bg-gradient-to-b from-red-500 to-red-700 transition-[width] duration-150 ease-out"
                        style={{ width: `${fillWidthPct}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
