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
    /** When true, segment and its tooltip stack above siblings. */
    isHighlighted: boolean;
    onPointerEnter: () => void;
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
    isHighlighted,
    onPointerEnter,
}: TimelinePhaseSegmentProps) {
    const clampedLeft = Math.max(0, Math.min(100, leftPercent));
    const clampedWidth = Math.max(0, Math.min(100 - clampedLeft, widthPercent));

    const style = PHASE_STYLE[phase];

    return (
        <div
            className="group absolute top-1/2 flex -translate-y-1/2 cursor-default items-center"
            style={{
                left: `${clampedLeft}%`,
                width: `${clampedWidth}%`,
                height: 28,
                zIndex: isHighlighted ? 50 : 10,
            }}
            onPointerEnter={onPointerEnter}
        >
            <div className="flex w-full flex-col items-stretch justify-center">
                <div
                    className={[
                        'w-full rounded-full transition-all duration-150',
                        style.baseHeight,
                        style.hoverHeight,
                        style.colorClass,
                    ].join(' ')}
                />
            </div>
            <div
                className="pointer-events-none absolute bottom-full left-1/2 mb-1 max-w-[min(280px,70vw)] -translate-x-1/2 rounded border border-border-custom bg-dark-900/95 px-2 py-1 text-xs text-gray-100 opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
                style={{ zIndex: isHighlighted ? 70 : 60 }}
            >
                <div className="font-semibold">{label}</div>
                {description && <div className="text-[11px] text-gray-300">{description}</div>}
            </div>
        </div>
    );
}
