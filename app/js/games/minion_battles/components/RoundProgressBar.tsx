/**
 * RoundProgressBar - Circular SVG progress bar in the top-right corner.
 *
 * Shows the current round number in the center.
 * The stroke fills up over 10 seconds of game time per round.
 * Freezes when the game is paused.
 */

import React, { useState } from 'react';
import { CARDS_PER_ROUND } from '../engine/GameEngine';

interface RoundProgressBarProps {
    /** Current round number (1-based). */
    roundNumber: number;
    /** Progress through the current round (0..1). */
    progress: number;
    /** Whether the game is paused. */
    isPaused: boolean;
}

const SIZE = 56;
const STROKE_WIDTH = 4;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RoundProgressBar({
    roundNumber,
    progress,
    isPaused,
}: RoundProgressBarProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const dashOffset = CIRCUMFERENCE * (1 - progress);

    return (
        <div
            className="absolute top-3 right-3 z-10"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            {showTooltip && (
                <div
                    className="absolute right-full mr-2 top-1/2 -translate-y-1/2 w-52 bg-dark-900/95 border border-dark-600 rounded-lg px-3 py-2 shadow-lg pointer-events-none z-20 text-gray-200 text-xs"
                    role="tooltip"
                >
                    At the beginning of each round, draw {CARDS_PER_ROUND} cards.
                </div>
            )}
            <svg
                width={SIZE}
                height={SIZE}
                className="transform -rotate-90"
            >
                {/* Background circle */}
                <circle
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="rgba(0, 0, 0, 0.6)"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth={STROKE_WIDTH}
                />
                {/* Progress arc */}
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
            {/* Round number in center */}
            <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-sm cursor-default">
                    {roundNumber}
                </span>
            </div>
        </div>
    );
}
