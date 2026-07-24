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
import SyncStatusCard from './SyncStatusCard';
import { pickTurnIndicatorPropsAfterUnfreeze } from './turnIndicatorPresentation';

export type TurnIndicatorState = 'your_turn' | 'ally_turn' | 'playing';

export interface HostCatchupPopoverProps {
    hostTick: number;
    targetTick: number | null;
    stuckHeartbeats: number;
    onForceResync: () => void;
}

interface TurnIndicatorProps {
    /** Current turn state. */
    state: TurnIndicatorState;
    /** Ally player name when state is 'ally_turn'. */
    allyName?: string;
    /** Increment to play a one-shot “Teamwork” burst above the plaque (coop cooldown sync). */
    /** Non-host: compact warning over the marker when host is behind on accepting orders. */
    hostCatchupPopover?: HostCatchupPopoverProps | null;
    /** Local multiplayer: orders queued on device until POST is allowed (see timeline for in-flight count). */
    orderPipeline?: { queued: number; sending: number } | null;
    /**
     * When set (ITS playahead active), replaces the plaque text with these controls.
     * Must be a single fixed-height line so the plaque does not grow.
     */
    itsControls?: React.ReactNode;
    /**
     * When true, ignore `state` / `allyName` changes (no shrink/grow blink).
     * Used to hold the plaque steady through an ITS rewind crossfade.
     * When this flips back to false, the current live props are applied (not a mid-freeze stash).
     */
    freezePresentation?: boolean;
}

const BLINK_DURATION_MS = 220;

const BORDER_THICKNESS_PX = 2;
const PLAQUE_MIN_HEIGHT_PX = 48;
const PLAQUE_MAX_WIDTH_PX = 760;

/** Left endcap with a pointed outer edge and flat inner edge. */
const LEFT_PLAQUE_CLIP = 'polygon(0% 50%, 18% 0%, 100% 0%, 100% 100%, 18% 100%)';
/** Right endcap with a pointed outer edge and flat inner edge. */
const RIGHT_PLAQUE_CLIP = 'polygon(0% 0%, 82% 0%, 100% 50%, 82% 100%, 0% 100%)';

export default function TurnIndicator({
    state,
    allyName = 'Player',
    hostCatchupPopover = null,
    orderPipeline = null,
    itsControls = null,
    freezePresentation = false,
}: TurnIndicatorProps) {
    const [phase, setPhase] = useState<'open' | 'closing' | 'closed' | 'opening'>(() =>
        state === 'playing' ? 'closed' : 'open',
    );
    const phaseRef = useRef(phase);
    phaseRef.current = phase;
    const [displayState, setDisplayState] = useState<TurnIndicatorState>(state);
    const [displayAllyName, setDisplayAllyName] = useState(allyName);
    const prevStateRef = useRef(state);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const clearTimer = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    };

    const applyStateChange = (next: TurnIndicatorState, nextAllyName: string) => {
        const prev = prevStateRef.current;
        prevStateRef.current = next;
        setDisplayAllyName(nextAllyName);

        if (next === prev) return;

        const currentPhase = phaseRef.current;

        if (currentPhase === 'open') {
            setPhase('closing');
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                setDisplayState(next);
                if (next === 'playing') {
                    setPhase('closed');
                } else {
                    setPhase('opening');
                    timeoutRef.current = setTimeout(() => {
                        timeoutRef.current = null;
                        setPhase('open');
                    }, BLINK_DURATION_MS);
                }
            }, BLINK_DURATION_MS);
        } else if (currentPhase === 'closed' && next !== 'playing') {
            setDisplayState(next);
            setPhase('opening');
            timeoutRef.current = setTimeout(() => {
                timeoutRef.current = null;
                setPhase('open');
            }, BLINK_DURATION_MS);
        } else if (currentPhase === 'closing' || currentPhase === 'opening') {
            clearTimer();
            setDisplayState(next);
            if (next === 'playing') {
                setPhase('closed');
            } else {
                setPhase('open');
            }
        }
    };

    useEffect(() => {
        // Hold the plaque steady during ITS rewind. When freeze ends (or live props change
        // while unfrozen), apply live props only — see pickTurnIndicatorPropsAfterUnfreeze.
        if (freezePresentation) return;
        const next = pickTurnIndicatorPropsAfterUnfreeze({ liveState: state, liveAllyName: allyName });
        applyStateChange(next.state, next.allyName);
        // applyStateChange closes over phase timers; intentional to run on state/freeze edges only.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- blink orchestration
    }, [state, allyName, freezePresentation]);

    useEffect(() => clearTimer, []);

    const forceOpenForIts = itsControls != null;
    const isExpanded = forceOpenForIts || phase === 'open' || phase === 'opening';
    const isCollapsed = !forceOpenForIts && (phase === 'closing' || phase === 'closed');

    const effectiveDisplayState: TurnIndicatorState = forceOpenForIts
        ? 'your_turn'
        : displayState;

    const borderColorClass =
        effectiveDisplayState === 'your_turn'
            ? 'bg-emerald-500/90'
            : effectiveDisplayState === 'ally_turn'
              ? 'bg-amber-400/90'
              : 'bg-border-custom';
    const borderAccentClass =
        effectiveDisplayState === 'your_turn'
            ? 'border-emerald-500/90'
            : effectiveDisplayState === 'ally_turn'
              ? 'border-amber-400/90'
              : 'border-border-custom';

    const lineGradientLeft =
        effectiveDisplayState === 'your_turn'
            ? 'bg-gradient-to-r from-transparent via-emerald-500/90 to-emerald-500/90'
            : effectiveDisplayState === 'ally_turn'
              ? 'bg-gradient-to-r from-transparent via-amber-400/90 to-amber-400/90'
              : 'bg-gradient-to-r from-transparent via-border-custom to-border-custom';
    const lineGradientRight =
        effectiveDisplayState === 'your_turn'
            ? 'bg-gradient-to-r from-emerald-500/90 via-emerald-500/90 to-transparent'
            : effectiveDisplayState === 'ally_turn'
              ? 'bg-gradient-to-r from-amber-400/90 via-amber-400/90 to-transparent'
              : 'bg-gradient-to-r from-border-custom via-border-custom to-transparent';

    const text =
        displayState === 'your_turn'
            ? 'Your Turn'
            : displayState === 'ally_turn'
              ? `${displayAllyName}'s Turn`
              : '';
    const plaqueStyle = {
        maxWidth: 'calc(100vw - 8rem)',
    } as const;
    const centerTextStyle = {
        width: itsControls ? 'min(28rem, calc(100vw - 10rem))' : 'fit-content',
        maxWidth: `min(${PLAQUE_MAX_WIDTH_PX}px, calc(100vw - 10rem))`,
    } as const;

    return (
        <div className="relative w-full shrink-0 py-1">
            {hostCatchupPopover && (
                <div
                    className="pointer-events-auto absolute left-1/2 bottom-full z-[70] mb-1 w-[min(17rem,calc(100vw-1.5rem))] -translate-x-1/2 backdrop-blur-[2px]"
                    role="status"
                >
                    <div className="flex items-start gap-2">
                        <div
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-amber-400/90 border-t-transparent"
                            aria-hidden
                        />
                        <SyncStatusCard
                            className="min-w-0 flex-1"
                            title="Waiting for host"
                            tone="warning"
                            summary={`Server tick ${hostCatchupPopover.hostTick} (last completed)${
                                hostCatchupPopover.targetTick != null
                                    ? ` · deferred order batch ${hostCatchupPopover.targetTick}`
                                    : ''
                            }${hostCatchupPopover.stuckHeartbeats > 0 ? ` · ${hostCatchupPopover.stuckHeartbeats} hb` : ''}`}
                            actions={
                                <button
                                    type="button"
                                    onClick={hostCatchupPopover.onForceResync}
                                    className="w-full rounded border border-amber-600/70 bg-amber-900/80 px-2 py-1 text-[10px] font-medium text-amber-100 hover:bg-amber-800/90"
                                >
                                    Force Resync
                                </button>
                            }
                        />
                    </div>
                </div>
            )}
            {orderPipeline != null && orderPipeline.queued > 0 && (
                <div
                    className="flex justify-end gap-1.5 px-2 pb-0.5"
                    aria-label="Order sync status"
                >
                    <span
                        className="rounded border border-slate-500/50 bg-slate-900/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-300"
                        title="Queued on device until the host timeline allows POST"
                    >
                        Queued {orderPipeline.queued}
                    </span>
                </div>
            )}
            <div className="flex w-full items-center justify-center gap-0">
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
                                paddingLeft: itsControls ? '12px' : undefined,
                                paddingRight: itsControls ? '12px' : undefined,
                            }}
                        >
                            {itsControls ? (
                                <div
                                    className="w-full min-w-0"
                                    style={{ opacity: isExpanded ? 1 : 0 }}
                                >
                                    {itsControls}
                                </div>
                            ) : (
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
                            )}
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
        </div>
    );
}
