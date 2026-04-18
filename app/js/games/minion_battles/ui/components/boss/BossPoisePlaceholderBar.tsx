import React from 'react';

type BossPoisePlaceholderBarProps = {
    poiseHp: number;
    maxPoiseHp: number;
};

/**
 * Placeholder for a future stun / stagger bar. Shows current poise as a neutral gray fill.
 * Tooltip (native `title`) reads "poise" until dedicated stun UX is defined.
 */
export function BossPoisePlaceholderBar({ poiseHp, maxPoiseHp }: BossPoisePlaceholderBarProps) {
    const hasPoise = maxPoiseHp > 0;
    const ratio = hasPoise ? Math.min(1, Math.max(0, poiseHp / maxPoiseHp)) : 0;

    return (
        <div className="pointer-events-auto mt-3 w-full" title="poise">
            <div
                className={`h-2.5 w-full overflow-hidden rounded-full border border-gray-600 bg-gray-800 ${
                    hasPoise ? '' : 'opacity-60'
                }`}
                role={hasPoise ? 'progressbar' : undefined}
                aria-valuemin={hasPoise ? 0 : undefined}
                aria-valuemax={hasPoise ? maxPoiseHp : undefined}
                aria-valuenow={hasPoise ? poiseHp : undefined}
                aria-label={hasPoise ? 'Poise' : undefined}
                aria-hidden={hasPoise ? undefined : true}
            >
                <div
                    className="h-full rounded-full bg-gray-500 transition-[width] duration-150 ease-out"
                    style={{ width: `${ratio * 100}%` }}
                />
            </div>
        </div>
    );
}
