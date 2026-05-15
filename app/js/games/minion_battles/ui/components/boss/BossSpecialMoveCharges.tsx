import React from 'react';

type BossSpecialMoveChargesProps = {
    filled: number;
    total: number;
    abilityName: string;
};

const SEGMENT_MIN_W = 'min-w-[2rem]';

/**
 * Segmented teal pill: one cell per charge. Charged = solid teal; empty = faded teal. Shared darker teal border; `overflow-hidden` + `rounded-md` clips fills to the same radius as the border.
 */
export function BossSpecialMoveChargesBar({ filled, total, abilityName }: BossSpecialMoveChargesProps) {
    const label = `${abilityName}: ${filled} of ${total} charges ready`;

    return (
        <div
            className="flex h-4 flex-row overflow-hidden rounded-md border-2 border-teal-900 shadow-sm"
            role="img"
            aria-label={label}
        >
            {Array.from({ length: total }, (_, i) => {
                const hasCharge = i < filled;
                return (
                    <div
                        key={i}
                        className={`h-full min-h-[0.8rem] flex-1 ${SEGMENT_MIN_W} ${
                            hasCharge ? 'bg-teal-500' : 'bg-teal-900'
                        }`}
                        aria-hidden
                    />
                );
            })}
        </div>
    );
}
