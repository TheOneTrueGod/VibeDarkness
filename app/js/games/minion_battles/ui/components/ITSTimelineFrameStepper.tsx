import React, { useLayoutEffect, useRef, useState } from 'react';
import {
    FRAMES_PER_PIP,
    OVERFLOW_LABEL_WIDTH_PX,
    PIP_GAP_PX,
    PIP_WIDTH_PX,
    computeItsTimelineKeyTickMarkers,
    computeItsTimelinePips,
    computeItsTimelineWindowForWidth,
} from './itsTimelineMath';

/** Matches the `px-0.5` padding on the track's outer edge. */
const TRACK_PADDING_PX = 2;

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

    const keyTickMarkers = computeItsTimelineKeyTickMarkers({ pipCount, framesPerPip });
    const keyTickPipIndices = new Set(keyTickMarkers.map((m) => m.pipIndex));

    const leftOverflowWidthPx = window.leftOverflow > 0 ? OVERFLOW_LABEL_WIDTH_PX : 0;
    const visibleKeyTickLabels = keyTickMarkers
        .filter((m) => m.pipIndex >= window.windowStart && m.pipIndex < window.windowStart + window.visibleCount)
        .map((m) => {
            const localIndex = m.pipIndex - window.windowStart;
            const leftPx =
                TRACK_PADDING_PX +
                leftOverflowWidthPx +
                localIndex * (PIP_WIDTH_PX + PIP_GAP_PX) +
                PIP_WIDTH_PX / 2;
            return { ...m, leftPx };
        });

    return (
        <div className="relative flex h-full min-w-0 flex-1">
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
                        const isKeyTick = !isCurrent && keyTickPipIndices.has(window.windowStart + i);
                        return (
                            <div
                                key={window.windowStart + i}
                                className={`shrink-0 rounded-[1px] ${
                                    isCurrent
                                        ? 'bg-red-500'
                                        : isKeyTick
                                          ? 'bg-gray-400'
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
            {visibleKeyTickLabels.length > 0 && (
                <div className="pointer-events-none absolute left-0 right-0 top-full z-10 h-0" aria-hidden>
                    {visibleKeyTickLabels.map((marker) => (
                        <span
                            key={marker.seconds}
                            className="absolute top-0.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-dark-600 bg-dark-900/95 px-1 py-px text-[8px] font-medium leading-none text-gray-300"
                            style={{ left: marker.leftPx }}
                        >
                            {marker.label}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
