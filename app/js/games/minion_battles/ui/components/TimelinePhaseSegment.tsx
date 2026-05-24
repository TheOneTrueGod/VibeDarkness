import React from 'react';

type PhaseId = 'startup' | 'active' | 'iFrame' | 'cooldown' | 'coopCooldown' | 'waiting';

export interface TimelinePhaseSegmentProps {
    phase: PhaseId;
    /** Left offset in the [0, 100] range (percentage of the timeline width). */
    leftPercent: number;
    /** Width in the [0, 100] range (percentage of the timeline width). */
    widthPercent: number;
    /** Human-readable phase name. */
    label: string;
    /** Short description (shown in panel flyout on hover, not inline). */
    description: string;
    /** When true, segment stacks above siblings for hover emphasis. */
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
    coopCooldown: {
        baseHeight: 'h-[4px]',
        hoverHeight: 'group-hover:h-[6px]',
        colorClass: 'bg-yellow-400',
    },
    waiting: {
        baseHeight: 'h-[3px]',
        hoverHeight: 'group-hover:h-[5px]',
        colorClass: 'bg-white/70',
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

    const titleText = description ? `${label} — ${description}` : label;

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
            title={titleText}
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
        </div>
    );
}
