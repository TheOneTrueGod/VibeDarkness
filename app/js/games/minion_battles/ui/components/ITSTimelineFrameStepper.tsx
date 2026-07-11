import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    FRAMES_PER_PIP,
    PIP_WIDTH_PX,
    computeItsTimelinePips,
    computeItsTimelineWindowForWidth,
} from './itsTimelineMath';

export interface ITSTimelineFrameStepperProps {
    /** Mark tick when ITS preview began. */
    startTick: number;
    /** Displayed playahead tick (live or rewind-animated). */
    currentTick: number;
    /** Farthest tick reached this preview segment (keeps future pips stable while rewinding). */
    highWaterTick: number;
    /** Expected cast length in engine ticks (0 if unknown). */
    expectedDurationTicks: number;
    /** Game ticks per pip. Defaults to {@link FRAMES_PER_PIP}. */
    framesPerPip?: number;
}

function OverflowChip({ count, side }: { count: number; side: 'left' | 'right' }) {
    if (count <= 0) return null;
    return (
        <span
            className={`shrink-0 self-center text-[9px] font-semibold leading-none tabular-nums text-violet-900/70 ${
                side === 'left' ? 'pr-0.5' : 'pl-0.5'
            }`}
            aria-label={`${count} more pips ${side === 'left' ? 'before' : 'after'} this view`}
        >
            +{count}
        </span>
    );
}

/**
 * Compact pip bar for ITS playahead progress inside the turn indicator.
 * Fixed-size pips; short abilities leave blank space on the right, long ones
 * window around the playhead with `+N` overflow chips.
 */
export default function ITSTimelineFrameStepper({
    startTick,
    currentTick,
    highWaterTick,
    expectedDurationTicks,
    framesPerPip = FRAMES_PER_PIP,
}: ITSTimelineFrameStepperProps) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [trackWidthPx, setTrackWidthPx] = useState(0);

    useLayoutEffect(() => {
        const el = trackRef.current;
        if (!el) return;
        const update = () => setTrackWidthPx(el.clientWidth);
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const { pipCount, currentPipIndex } = computeItsTimelinePips({
        startTick,
        currentTick,
        highWaterTick,
        expectedDurationTicks,
        framesPerPip,
    });

    const window = computeItsTimelineWindowForWidth({
        pipCount,
        currentPipIndex,
        trackWidthPx: Math.max(0, trackWidthPx),
    });

    return (
        <div
            ref={trackRef}
            className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden rounded-sm border border-dark-600 bg-white/95 px-0.5 py-0.5"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, pipCount - 1)}
            aria-valuenow={currentPipIndex}
            aria-label="ITS playahead timeline"
        >
            <OverflowChip count={window.leftOverflow} side="left" />
            <div className="flex min-w-0 flex-1 items-stretch justify-start gap-px overflow-hidden">
                {Array.from({ length: window.visibleCount }, (_, i) => {
                    const isCurrent = i === window.visibleCurrentIndex;
                    const isPassed = i < window.visibleCurrentIndex;
                    return (
                        <div
                            key={window.windowStart + i}
                            className={`shrink-0 rounded-[1px] ${
                                isCurrent
                                    ? 'bg-red-500'
                                    : isPassed
                                      ? 'bg-gray-900'
                                      : 'bg-violet-900/35'
                            }`}
                            style={{ width: PIP_WIDTH_PX }}
                            aria-hidden
                        />
                    );
                })}
            </div>
            <OverflowChip count={window.rightOverflow} side="right" />
        </div>
    );
}
