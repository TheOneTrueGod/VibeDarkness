import React, { useState } from 'react';
import { ROUND_STAMINA_RECOVERY } from '../../game/GameEngine';

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
    const [showTooltip, setShowTooltip] = useState(false);
    const dashOffset = CIRCUMFERENCE * (1 - progress);

    return (
        <div
            ref={onRootRef}
            className="relative w-[80px] h-[104px] rounded-lg border-2 border-dark-500 bg-dark-700 flex items-center justify-center flex-shrink-0"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {showTooltip && (
                <div
                    className="absolute left-full ml-3 top-1/2 -translate-y-1/2 w-64 bg-black/95 border border-dark-600 rounded-lg px-3 py-2 shadow-lg pointer-events-none z-20 text-gray-200 text-xs"
                    role="tooltip"
                >
                    At the start of each round, recover <span className="text-yellow-400 font-semibold">{ROUND_STAMINA_RECOVERY}</span> stamina.
                </div>
            )}
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
                    <span className="text-white font-bold text-sm cursor-default">{roundNumber}</span>
                </div>
            </div>
        </div>
    );
}
