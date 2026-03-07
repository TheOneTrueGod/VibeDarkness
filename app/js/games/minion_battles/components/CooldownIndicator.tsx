/**
 * CooldownIndicator - Circular progress indicator for unit cooldown.
 *
 * When the unit has an active ability with abilityTimings, the ring is divided
 * into segments (windup / active / cooldown etc.). Otherwise a single color is used.
 * Uses requestAnimationFrame for smooth 60fps animation.
 */

import React, { useRef, useEffect, useCallback } from 'react';
import type { Unit } from '../objects/Unit';
import { getAbility } from '../abilities/AbilityRegistry';
import { AbilityPhase, ABILITY_PHASE_COLORS } from '../abilities/abilityTimings';

interface CooldownIndicatorProps {
    /** The player's unit to read cooldown from. */
    unit: Unit;
    /** Diameter of the indicator in pixels. */
    size?: number;
    /** Current game time (seconds). Required for segmented display when an ability is active. */
    gameTime: number;
}

export default function CooldownIndicator({ unit, size = 48, gameTime }: CooldownIndicatorProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const singleCircleRef = useRef<SVGCircleElement>(null);
    const textRef = useRef<SVGTextElement>(null);
    const rafRef = useRef<number>(0);

    const radius = (size - 6) / 2;
    const circumference = 2 * Math.PI * radius;
    const center = size / 2;

    const animate = useCallback(() => {
        const active = unit.activeAbilities[0];
        const ability = active ? getAbility(active.abilityId) : null;
        const timings = ability?.abilityTimings;

        let progress: number;
        let remaining: number;
        let segmentCircles: { length: number; offset: number; color: string }[] = [];

        if (active && timings && timings.length > 0) {
            const totalDuration = timings.reduce((s, t) => s + t.duration, 0);
            const elapsed = Math.min(gameTime - active.startTime, totalDuration);
            progress = totalDuration > 0 ? elapsed / totalDuration : 1;
            remaining = Math.max(0, totalDuration - elapsed);

            const fillAngle = progress * 2 * Math.PI;
            let accAngle = 0;
            for (const timing of timings) {
                const segStart = accAngle;
                const segEnd = accAngle + (timing.duration / totalDuration) * 2 * Math.PI;
                accAngle = segEnd;
                const drawEnd = Math.min(segEnd, fillAngle);
                if (drawEnd <= segStart) continue;
                const arcLength = (drawEnd - segStart) * radius;
                const offset = segStart * radius;
                const color = ABILITY_PHASE_COLORS[timing.abilityPhase] ?? '#94a3b8';
                segmentCircles.push({ length: arcLength, offset, color });
            }
        } else {
            const total = unit.cooldownTotal;
            remaining = unit.cooldownRemaining;
            progress = total > 0 ? Math.max(0, Math.min(1, 1 - remaining / total)) : 1;
        }

        // Update segment arcs when in segment mode
        const group = containerRef.current?.querySelector('[data-segment-group]');
        if (group && segmentCircles.length > 0) {
            const circles = group.querySelectorAll('circle');
            segmentCircles.forEach((seg, i) => {
                const el = circles[i];
                if (el) {
                    el.style.strokeDasharray = `${seg.length} ${circumference}`;
                    el.style.strokeDashoffset = String(seg.offset);
                    el.setAttribute('stroke', seg.color);
                }
            });
            // Hide extra circles
            circles.forEach((el, i) => {
                (el as SVGElement).style.display = i < segmentCircles.length ? 'block' : 'none';
            });
        }

        // Update single-arc circle when not in segment mode
        const singleEl = singleCircleRef.current;
        if (singleEl && segmentCircles.length === 0) {
            singleEl.style.strokeDashoffset = String(circumference * (1 - progress));
            singleEl.setAttribute(
                'stroke',
                remaining <= 0 && !active ? '#4ade80' : ABILITY_PHASE_COLORS[AbilityPhase.Cooldown],
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
    }, [unit, gameTime, circumference, radius]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [animate]);

    const active = unit.activeAbilities[0];
    const ability = active ? getAbility(active.abilityId) : null;
    const timings = ability?.abilityTimings;
    const useSegments = Boolean(active && timings && timings.length > 0);
    const isReady = unit.cooldownRemaining <= 0 && !active;

    // Default segment count for initial render (so we have enough circle elements to update in rAF)
    const maxSegments = useSegments ? timings!.length : 1;

    return (
        <div
            ref={containerRef}
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
                {/* Segmented progress arcs (updated by rAF) */}
                <g data-segment-group transform={`rotate(-90 ${center} ${center})`}>
                    {Array.from({ length: maxSegments }, (_, i) => (
                        <circle
                            key={i}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke={ABILITY_PHASE_COLORS[AbilityPhase.Cooldown]}
                            strokeWidth={4}
                            strokeLinecap="round"
                            strokeDasharray={circumference}
                            strokeDashoffset={circumference}
                            style={{ display: i === 0 ? 'block' : 'none' }}
                        />
                    ))}
                </g>
                {/* Fallback single arc when no segments (updated by rAF for smooth animation) */}
                <circle
                    ref={singleCircleRef}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={isReady ? '#4ade80' : ABILITY_PHASE_COLORS[AbilityPhase.Cooldown]}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - (unit.cooldownTotal > 0 ? Math.max(0, 1 - unit.cooldownRemaining / unit.cooldownTotal) : 1))}
                    transform={`rotate(-90 ${center} ${center})`}
                    style={{ display: useSegments ? 'none' : 'block' }}
                />
                {/* Countdown text */}
                <text
                    ref={textRef}
                    x={center}
                    y={center}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isReady ? '#4ade80' : '#e5e5e5'}
                    fontSize={size * 0.3}
                    fontFamily="monospace"
                    fontWeight="bold"
                />
            </svg>
        </div>
    );
}
