import React from 'react';

type PhaseId = 'startup' | 'active' | 'iFrame' | 'cooldown';

export interface TimelinePhaseSegmentProps {
    phase: PhaseId;
    /** Left offset in the [0, 100] range (percentage of the timeline width). */
    leftPercent: number;
    /** Width in the [0, 100] range (percentage of the timeline width). */
    widthPercent: number;
    /** Human-readable phase name. */
    label: string;
    /** Short description for tooltip. */
    description: string;
}

const PHASE_STYLE: Record<
    PhaseId,
    {
        baseHeight: string;
        hoverHeight: string;
        colorClass: string;
    }
> = {
    startup: {
        baseHeight: 'h-[2px]',
        hoverHeight: 'group-hover:h-[4px]',
        colorClass: 'bg-white',
    },
    active: {
        baseHeight: 'h-[4px]',
        hoverHeight: 'group-hover:h-[6px]',
        colorClass: 'bg-red-500',
    },
    iFrame: {
        baseHeight: 'h-[4px]',
        hoverHeight: 'group-hover:h-[6px]',
        colorClass: 'bg-yellow-400',
    },
    cooldown: {
        baseHeight: 'h-[2px]',
        hoverHeight: 'group-hover:h-[4px]',
        colorClass: 'bg-gray-500',
    },
};

export function TimelinePhaseSegment({
    phase,
    leftPercent,
    widthPercent,
    label,
    description,
}: TimelinePhaseSegmentProps) {
    const clampedLeft = Math.max(0, Math.min(100, leftPercent));
    const clampedWidth = Math.max(0, Math.min(100 - clampedLeft, widthPercent));

    const style = PHASE_STYLE[phase];

    return (
        <div
            className="absolute top-1/2 -translate-y-1/2 group"
            style={{
                left: `${clampedLeft}%`,
                width: `${clampedWidth}%`,
            }}
        >
            <div
                className={[
                    'w-full rounded-full transition-all duration-150',
                    style.baseHeight,
                    style.hoverHeight,
                    style.colorClass,
                ].join(' ')}
            />
            <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-1 rounded bg-dark-900/95 border border-border-custom text-xs text-gray-100 opacity-0 pointer-events-none group-hover:opacity-100 z-20">
                <div className="font-semibold">{label}</div>
                {description && <div className="text-[11px] text-gray-300">{description}</div>}
            </div>
        </div>
    );
}

