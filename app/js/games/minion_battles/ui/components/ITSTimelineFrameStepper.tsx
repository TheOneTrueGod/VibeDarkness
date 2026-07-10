import React from 'react';
import { DEFAULT_FRAMES_PER_PIP, computeItsTimelinePips } from './itsTimelineMath';

export interface ITSTimelineFrameStepperProps {
    /** Mark tick when ITS preview began. */
    startTick: number;
    /** Displayed playahead tick (live or rewind-animated). */
    currentTick: number;
    /** Farthest tick reached this preview segment (keeps future pips stable while rewinding). */
    highWaterTick: number;
    /** Expected cast length in engine ticks (0 if unknown). */
    expectedDurationTicks: number;
    /** Game ticks per pip. Defaults to {@link DEFAULT_FRAMES_PER_PIP}. */
    framesPerPip?: number;
}

/**
 * Compact pip bar for ITS playahead progress inside the turn indicator.
 * Passed / current / future pips update as playahead advances or rewinds.
 */
export default function ITSTimelineFrameStepper({
    startTick,
    currentTick,
    highWaterTick,
    expectedDurationTicks,
    framesPerPip = DEFAULT_FRAMES_PER_PIP,
}: ITSTimelineFrameStepperProps) {
    const { pipCount, currentPipIndex } = computeItsTimelinePips({
        startTick,
        currentTick,
        highWaterTick,
        expectedDurationTicks,
        framesPerPip,
    });

    return (
        <div
            className="flex h-full min-w-0 flex-1 items-stretch overflow-hidden rounded-sm border border-dark-600 bg-white/95 px-0.5 py-0.5"
            role="meter"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, pipCount - 1)}
            aria-valuenow={currentPipIndex}
            aria-label="ITS playahead timeline"
        >
            <div className="flex min-w-0 flex-1 items-stretch gap-px">
                {Array.from({ length: pipCount }, (_, i) => {
                    const isCurrent = i === currentPipIndex;
                    const isPassed = i < currentPipIndex;
                    return (
                        <div
                            key={i}
                            className={`min-w-[2px] flex-1 rounded-[1px] ${
                                isCurrent
                                    ? 'bg-red-500'
                                    : isPassed
                                      ? 'bg-gray-900'
                                      : 'bg-violet-900/35'
                            }`}
                            aria-hidden
                        />
                    );
                })}
            </div>
        </div>
    );
}
