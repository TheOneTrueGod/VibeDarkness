/**
 * TurnIndicator - Full-width line with a diamond plaque showing whose turn it is.
 *
 * States:
 * - Your turn: "Your Turn", green embossed border
 * - Ally's turn: "<AllyName>'s Turn", yellow embossed border
 * - Playing (no one's turn): plaque shrinks, no text
 *
 * On state change, the plaque "blinks" closed then opens to the new text.
 */

import React, { useState, useEffect, useRef } from 'react';

export type TurnIndicatorState = 'your_turn' | 'ally_turn' | 'playing';

interface TurnIndicatorProps {
    /** Current turn state. */
    state: TurnIndicatorState;
    /** Ally player name when state is 'ally_turn'. */
    allyName?: string;
}

const BLINK_DURATION_MS = 220;

/** 6-sided plaque: flat top/bottom, sides indent at the middle (< >). */
const PLAQUE_CLIP = 'polygon(0% 0%, 100% 0%, 85% 50%, 100% 100%, 0% 100%, 15% 50%)';

export default function TurnIndicator({ state, allyName = 'Player' }: TurnIndicatorProps) {
    const [phase, setPhase] = useState<'open' | 'closing' | 'closed' | 'opening'>(() =>
        state === 'playing' ? 'closed' : 'open',
    );
    const [displayState, setDisplayState] = useState<TurnIndicatorState>(state);
    const prevStateRef = useRef(state);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const prev = prevStateRef.current;
        prevStateRef.current = state;

        if (state === prev) return;

        const clearTimer = () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        };

        if (phase === 'open') {
            setPhase('closing');
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                setDisplayState(state);
                if (state === 'playing') {
                    setPhase('closed');
                } else {
                    setPhase('opening');
                    timeoutRef.current = setTimeout(() => {
                        timeoutRef.current = null;
                        setPhase('open');
                    }, BLINK_DURATION_MS);
                }
            }, BLINK_DURATION_MS);
        } else if (phase === 'closed' && state !== 'playing') {
            setDisplayState(state);
            setPhase('opening');
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                setPhase('open');
            }, BLINK_DURATION_MS);
        }
        return clearTimer;
    }, [state]);

    const isExpanded = phase === 'open' || phase === 'opening';
    const isCollapsed = phase === 'closing' || phase === 'closed';

    const borderColorClass =
        displayState === 'your_turn'
            ? 'bg-emerald-500/90'
            : displayState === 'ally_turn'
              ? 'bg-amber-400/90'
              : 'bg-border-custom';

    const lineGradientLeft =
        displayState === 'your_turn'
            ? 'bg-gradient-to-r from-transparent via-emerald-500/90 to-emerald-500/90'
            : displayState === 'ally_turn'
              ? 'bg-gradient-to-r from-transparent via-amber-400/90 to-amber-400/90'
              : 'bg-gradient-to-r from-transparent via-border-custom to-border-custom';
    const lineGradientRight =
        displayState === 'your_turn'
            ? 'bg-gradient-to-r from-emerald-500/90 via-emerald-500/90 to-transparent'
            : displayState === 'ally_turn'
              ? 'bg-gradient-to-r from-amber-400/90 via-amber-400/90 to-transparent'
              : 'bg-gradient-to-r from-border-custom via-border-custom to-transparent';

    const text =
        displayState === 'your_turn'
            ? 'Your Turn'
            : displayState === 'ally_turn'
              ? `${allyName}'s Turn`
              : '';

    return (
        <div className="w-full flex items-center justify-center gap-0 shrink-0 py-1">
            {/* Left line */}
            <div
                className={`flex-1 h-1 min-w-[8px] ${lineGradientLeft}`}
                style={{ maxWidth: '40%' }}
            />
            {/* 6-sided plaque: outer border layer + inner content layer so border is always visible */}
            <div
                className="flex items-center justify-center mx-2 transition-all duration-[220ms] ease-out"
                style={{
                    transform: isCollapsed ? 'scale(0.35)' : 'scale(1)',
                }}
            >
                <div className="relative flex items-center justify-center w-[280px] h-12">
                    {/* Outer hexagon: visible border (thick coloured ring) */}
                    <div
                        className={`absolute inset-0 w-full h-full transition-colors duration-[220ms] ease-out ${borderColorClass}`}
                        style={{ clipPath: PLAQUE_CLIP }}
                    />
                    {/* Inner hexagon: surface + emboss, centered so border shows around it */}
                    <div
                        className="relative w-[250px] h-10 bg-surface-light transition-[box-shadow] duration-[220ms] ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.3)]"
                        style={{ clipPath: PLAQUE_CLIP }}
                    >
                        <div
                            className="w-full h-full flex items-center justify-center text-center transition-opacity duration-150"
                            style={{ opacity: isExpanded && text ? 1 : 0 }}
                        >
                            <span
                                className={`
                                    text-sm font-bold tracking-wide uppercase
                                    ${displayState === 'your_turn' ? 'text-emerald-300' : ''}
                                    ${displayState === 'ally_turn' ? 'text-amber-200' : ''}
                                    ${displayState === 'playing' ? 'text-gray-400' : ''}
                                `}
                            >
                                {text || (isCollapsed ? '' : '—')}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
            {/* Right line */}
            <div
                className={`flex-1 h-1 min-w-[8px] ${lineGradientRight}`}
                style={{ maxWidth: '40%' }}
            />
        </div>
    );
}
