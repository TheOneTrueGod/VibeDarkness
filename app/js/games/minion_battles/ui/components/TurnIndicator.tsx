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

const BORDER_THICKNESS_PX = 2;
const PLAQUE_MIN_HEIGHT_PX = 48;
const PLAQUE_MAX_WIDTH_PX = 760;

/** Left endcap with a pointed outer edge and flat inner edge. */
const LEFT_PLAQUE_CLIP = 'polygon(0% 50%, 18% 0%, 100% 0%, 100% 100%, 18% 100%)';
/** Right endcap with a pointed outer edge and flat inner edge. */
const RIGHT_PLAQUE_CLIP = 'polygon(0% 0%, 82% 0%, 100% 50%, 82% 100%, 0% 100%)';

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
        } else if (phase === 'closing' || phase === 'opening') {
            // State changed mid-animation: cancel the blink and jump to the correct state
            clearTimer();
            setDisplayState(state);
            if (state === 'playing') {
                setPhase('closed');
            } else {
                setPhase('open');
            }
        }
        return clearTimer;
    }, [state, phase]);

    const isExpanded = phase === 'open' || phase === 'opening';
    const isCollapsed = phase === 'closing' || phase === 'closed';

    const borderColorClass =
        displayState === 'your_turn'
            ? 'bg-emerald-500/90'
            : displayState === 'ally_turn'
              ? 'bg-amber-400/90'
              : 'bg-border-custom';
    const borderAccentClass =
        displayState === 'your_turn'
            ? 'border-emerald-500/90'
            : displayState === 'ally_turn'
              ? 'border-amber-400/90'
              : 'border-border-custom';

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
    const plaqueStyle = {
        maxWidth: 'calc(100vw - 8rem)',
    } as const;
    const centerTextStyle = {
        width: 'fit-content',
        maxWidth: `min(${PLAQUE_MAX_WIDTH_PX}px, calc(100vw - 10rem))`,
    } as const;

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
            <div className="inline-flex max-w-full items-stretch justify-center" style={plaqueStyle}>
                    {/* Left endcap */}
                    <div
                        className="relative flex-none self-stretch"
                        style={{ width: '2.5rem', minHeight: `${PLAQUE_MIN_HEIGHT_PX}px` }}
                    >
                        <div
                            className={`absolute inset-0 transition-colors duration-[220ms] ease-out ${borderColorClass}`}
                            style={{ clipPath: LEFT_PLAQUE_CLIP }}
                        />
                        <div
                            className="absolute transition-[box-shadow] duration-[220ms] ease-out bg-surface-light shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.3)]"
                            style={{
                                inset: `${BORDER_THICKNESS_PX}px`,
                                clipPath: LEFT_PLAQUE_CLIP,
                            }}
                        />
                        <div
                            className={`absolute right-0 top-[2px] bottom-[2px] w-[2px] bg-surface-light ${isCollapsed ? 'hidden' : ''}`}
                            aria-hidden="true"
                        />
                    </div>

                    {/* Center text block with top/bottom borders */}
                    <div
                        className={`relative flex-none self-stretch min-w-0 border-y-[2px] border-solid bg-surface-light transition-[box-shadow,border-color] duration-[220ms] ease-out shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.3)] ${borderAccentClass}`}
                        style={centerTextStyle}
                    >
                        <div
                            className="flex min-h-[48px] items-center justify-center px-5 py-3 text-center transition-opacity duration-150"
                            style={{
                                paddingTop: `${Math.max(12 - BORDER_THICKNESS_PX, 8)}px`,
                                paddingBottom: `${Math.max(12 - BORDER_THICKNESS_PX, 8)}px`,
                            }}
                        >
                            <span
                                className={`
                                    block max-w-full text-sm font-bold tracking-wide uppercase leading-5 whitespace-pre-wrap break-words
                                    ${displayState === 'your_turn' ? 'text-emerald-300' : ''}
                                    ${displayState === 'ally_turn' ? 'text-amber-200' : ''}
                                    ${displayState === 'playing' ? 'text-gray-400' : ''}
                                `}
                                style={{ opacity: isExpanded && text ? 1 : 0 }}
                            >
                                {text || (isCollapsed ? '' : '—')}
                            </span>
                        </div>
                    </div>

                    {/* Right endcap */}
                    <div
                        className="relative flex-none self-stretch"
                        style={{ width: '2.5rem', minHeight: `${PLAQUE_MIN_HEIGHT_PX}px` }}
                    >
                        <div
                            className={`absolute inset-0 transition-colors duration-[220ms] ease-out ${borderColorClass}`}
                            style={{ clipPath: RIGHT_PLAQUE_CLIP }}
                        />
                        <div
                            className="absolute transition-[box-shadow] duration-[220ms] ease-out bg-surface-light shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.3)]"
                            style={{
                                inset: `${BORDER_THICKNESS_PX}px`,
                                clipPath: RIGHT_PLAQUE_CLIP,
                            }}
                        />
                        <div
                            className={`absolute left-0 top-[2px] bottom-[2px] w-[2px] bg-surface-light ${isCollapsed ? 'hidden' : ''}`}
                            aria-hidden="true"
                        />
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
