import React, { useRef, useState } from 'react';
import { AnchoredPortalTooltip } from './AnchoredPortalTooltip';
import { ROUND_DURATION } from '../../game/gameConstants';

interface RoundTrackerCardProps {
    roundNumber: number;
    progress: number;
    isPaused: boolean;
    onRootRef?: (el: HTMLDivElement | null) => void;
}

const SIZE = 56;
const STROKE_WIDTH = 4;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RoundTrackerCard({
    roundNumber,
    progress,
    isPaused,
    onRootRef,
}: RoundTrackerCardProps) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const dashOffset = CIRCUMFERENCE * (1 - progress);

    return (
        <>
            <div
                ref={(el) => {
                    rootRef.current = el;
                    onRootRef?.(el);
                }}
                className="relative flex h-[104px] w-[80px] flex-shrink-0 items-center justify-center rounded-lg border-2 border-dark-500 bg-dark-700"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                <div className="relative">
                    <svg width={SIZE} height={SIZE} className="transform -rotate-90">
                        <circle
                            cx={SIZE / 2}
                            cy={SIZE / 2}
                            r={RADIUS}
                            fill="rgba(0, 0, 0, 0.6)"
                            stroke="rgba(255, 255, 255, 0.15)"
                            strokeWidth={STROKE_WIDTH}
                        />
                        <circle
                            cx={SIZE / 2}
                            cy={SIZE / 2}
                            r={RADIUS}
                            fill="none"
                            stroke={isPaused ? '#eab308' : '#22c55e'}
                            strokeWidth={STROKE_WIDTH}
                            strokeDasharray={CIRCUMFERENCE}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round"
                            className="transition-[stroke] duration-300"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="cursor-default text-sm font-bold text-white">{roundNumber}</span>
                    </div>
                </div>
            </div>
            <AnchoredPortalTooltip
                anchorRef={rootRef}
                open={showTooltip}
                className="w-64 rounded-lg border border-dark-600 bg-black/95 px-3 py-2 text-xs text-gray-200 shadow-lg"
            >
                A round lasts{' '}
                <span className="font-semibold text-yellow-400">{ROUND_DURATION}</span> seconds.
            </AnchoredPortalTooltip>
        </>
    );
}
