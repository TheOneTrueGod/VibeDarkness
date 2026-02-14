/**
 * CooldownIndicator - Circular progress indicator for unit cooldown.
 *
 * Reads cooldownRemaining / cooldownTotal from the Unit directly via
 * requestAnimationFrame for smooth 60fps animation independent of React renders.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { Unit } from '../objects/Unit';

interface CooldownIndicatorProps {
    /** The player's unit to read cooldown from. */
    unit: Unit;
    /** Diameter of the indicator in pixels. */
    size?: number;
}

export default function CooldownIndicator({ unit, size = 48 }: CooldownIndicatorProps) {
    const circleRef = useRef<SVGCircleElement>(null);
    const textRef = useRef<SVGTextElement>(null);
    const rafRef = useRef<number>(0);

    const radius = (size - 6) / 2; // leave room for stroke
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    const animate = useCallback(() => {
        const remaining = unit.cooldownRemaining;
        const total = unit.cooldownTotal;

        // Progress: 0 = just started (full ring), 1 = cooldown done (empty ring)
        const progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 1;

        if (circleRef.current) {
            circleRef.current.style.strokeDashoffset = String(
                circumference * (1 - progress),
            );
        }

        if (textRef.current) {
            if (remaining > 0) {
                textRef.current.textContent = remaining.toFixed(1);
            } else {
                textRef.current.textContent = '';
            }
        }

        rafRef.current = requestAnimationFrame(animate);
    }, [unit, circumference]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [animate]);

    // Determine ring color: green when ready, amber while on cooldown
    // (color transitions are handled via the class; the actual value is
    // driven by the rAF loop above so CSS transitions aren't used.)
    const isReady = unit.cooldownRemaining <= 0;

    return (
        <div
            className="flex-shrink-0 flex items-center justify-center"
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} className="block">
                {/* Background track */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth={4}
                />
                {/* Progress arc */}
                <circle
                    ref={circleRef}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={isReady ? '#4ade80' : '#fbbf24'}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference}
                    transform={`rotate(-90 ${center} ${center})`}
                />
                {/* Countdown text */}
                <text
                    ref={textRef}
                    x={center}
                    y={center}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isReady ? '#4ade80' : '#fbbf24'}
                    fontSize={size * 0.3}
                    fontFamily="monospace"
                    fontWeight="bold"
                />
            </svg>
        </div>
    );
}
