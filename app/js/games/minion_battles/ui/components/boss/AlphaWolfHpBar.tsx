import React from 'react';
import { Flame, Skull } from 'lucide-react';
import type { BossArcadeHpBarProps } from './BossArcadeHpBar';
import { ALPHA_WOLF_ENRAGE_THRESHOLD } from '../../../constants/enemyConstants';

const THRESHOLD_LEFT = `${ALPHA_WOLF_ENRAGE_THRESHOLD * 100}%`;

/**
 * Alpha Wolf HP bar: same as the base bar, plus a grey threshold line at the enrage
 * HP percent and a Skull icon hanging at the bottom of that line.
 */
export function AlphaWolfHpBar({ name, hp, maxHp, isEnraged }: BossArcadeHpBarProps) {
    const safeMax = maxHp > 0 ? maxHp : 1;
    const ratio = Math.min(1, Math.max(0, hp / safeMax));
    const fillWidthPct = ratio * 100;

    return (
        <div className="relative">
            <div
                className="relative h-9 w-full overflow-hidden rounded-sm border-4 border-red-950 shadow-md sm:h-10"
                aria-label={`${name} health ${Math.round(ratio * 100)} percent`}
            >
                <div className="absolute inset-0 bg-red-950/95" aria-hidden />
                <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-b from-red-500 to-red-700 transition-[width] duration-150 ease-out"
                    style={{ width: `${fillWidthPct}%` }}
                    aria-hidden
                />
                {/* Enrage threshold line — visible over the fill */}
                <div
                    className="absolute inset-y-0 z-10 w-px bg-gray-400/60"
                    style={{ left: THRESHOLD_LEFT }}
                    aria-hidden
                />
                <div className="relative z-10 flex h-full items-center justify-center gap-1.5 px-3">
                    {isEnraged && (
                        <Flame className="h-4 w-4 shrink-0 text-orange-400 drop-shadow-[0_0_4px_rgba(251,146,60,0.9)]" aria-hidden />
                    )}
                    <span className="max-w-full truncate text-center text-xs font-bold uppercase tracking-[0.18em] text-gray-100 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:text-sm">
                        {name}
                    </span>
                    {isEnraged && (
                        <Flame className="h-4 w-4 shrink-0 text-orange-400 drop-shadow-[0_0_4px_rgba(251,146,60,0.9)]" aria-hidden />
                    )}
                </div>
            </div>
            {/* Skull centered on the bottom edge of the bar, with a black circular background. */}
            <div
                className="pointer-events-none absolute bottom-0 z-10 -translate-x-1/2 translate-y-1/2 rounded-full bg-black p-0.5"
                style={{ left: THRESHOLD_LEFT }}
                aria-hidden
            >
                <Skull className="h-4 w-4 text-gray-400/80" />
            </div>
        </div>
    );
}
