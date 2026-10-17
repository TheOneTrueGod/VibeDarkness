import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TestIds } from '../../../../../testing/testIds';
import { getHudAnchorRect } from '../hudAnchors';
import {
    OBJECTIVES_POPOVER_ENABLED,
    OBJECTIVES_POPOVER_TIMINGS,
    type ObjectivePresentationRow,
    type ObjectivesPopoverPhase,
    type ObjectivesPopoverState,
} from './objectivePresentation';
import { centeredRect, computeFlightTransform, flightTransformToCss, type RectLike } from './objectivesPopoverGeometry';

export interface ObjectivesPopoverProps {
    state: ObjectivesPopoverState;
    onStart: () => void;
    /** Fired once per phase entry when the card's flight/fade transition ends (docking, expanding, fadingOut). */
    onPhaseAnimationEnd?: (phase: ObjectivesPopoverPhase) => void;
    /** Used as the fly target when the `objectives` HUD anchor is not mounted (e.g. chat column closed). */
    fallbackAnchorRect: RectLike | null;
}

type Pose = 'center' | 'anchor';

function prefersReducedMotion(): boolean {
    try {
        return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

/** Phases where the card is not drawn (the real panel is visible instead). */
function isInvisiblePhase(phase: ObjectivesPopoverPhase): boolean {
    return phase === 'hidden' || phase === 'docked';
}

interface RowProps {
    row: ObjectivePresentationRow;
    /** Animate the tick/line-through in (starts unticked). */
    animateCheck: boolean;
    checkDelayMs: number;
    /** Slide out to the right and fade. */
    sliding: boolean;
    /** Fade in on mount. */
    fadeIn: boolean;
    reduced: boolean;
}

function PopoverRow({ row, animateCheck, checkDelayMs, sliding, fadeIn, reduced }: RowProps) {
    const [armed, setArmed] = useState(!animateCheck && !fadeIn);
    useEffect(() => {
        if (armed) {
            return undefined;
        }
        const id = requestAnimationFrame(() => requestAnimationFrame(() => setArmed(true)));
        return () => cancelAnimationFrame(id);
    }, [armed]);

    const ticked = row.completed && (!animateCheck || armed);
    const opacity = fadeIn && !armed ? 0 : sliding ? 0 : 1;
    const slideTransform = sliding && !reduced ? 'translateX(110%)' : 'translateX(0)';
    const duration = sliding ? OBJECTIVES_POPOVER_TIMINGS.sliding : 350;
    return (
        <li
            className={`flex items-start gap-2 rounded-md px-1.5 py-1 text-sm leading-snug ${
                ticked ? 'text-gray-500' : 'text-gray-200'
            }`}
            style={{
                opacity,
                transform: slideTransform,
                transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-in`,
            }}
        >
            <span
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                    ticked
                        ? 'border-emerald-600/80 bg-green-900/40 text-green-400'
                        : 'border-border-custom bg-dark-900 text-gray-500'
                }`}
                style={{
                    transition: `transform 250ms ease-out ${checkDelayMs}ms`,
                    transform: ticked && animateCheck && !reduced ? 'scale(1.25)' : 'scale(1)',
                }}
                aria-hidden
            >
                {ticked ? '✓' : ''}
            </span>
            <span className={ticked ? 'line-through' : ''}>{row.label}</span>
        </li>
    );
}

/**
 * Presentational objectives popover. Portaled to `document.body` (`position: fixed`) so it can fly between the
 * screen centre and the sidebar objectives panel. All sequencing comes from `state` (see `objectivePresentation`).
 */
export default function ObjectivesPopover({
    state,
    onStart,
    onPhaseAnimationEnd,
    fallbackAnchorRect,
}: ObjectivesPopoverProps) {
    const { phase } = state;
    const cardRef = useRef<HTMLDivElement | null>(null);
    const [pose, setPose] = useState<Pose>('center');
    const [transition, setTransition] = useState(false);
    const [anchorTransform, setAnchorTransform] = useState('none');
    const reducedRef = useRef(prefersReducedMotion());
    const reduced = reducedRef.current;
    const endedPhaseRef = useRef<ObjectivesPopoverPhase | null>(null);

    // Phase-driven pose. `expanding` starts at the anchor (no transition) then flies to the centre.
    useLayoutEffect(() => {
        endedPhaseRef.current = null;
        const card = cardRef.current;
        if (phase === 'expanding' || phase === 'docking') {
            let transform = 'none';
            if (card) {
                const centre = centeredRect(card.offsetWidth, card.offsetHeight, window.innerWidth, window.innerHeight);
                const anchor = getHudAnchorRect('objectives') ?? fallbackAnchorRect;
                if (anchor) {
                    transform = flightTransformToCss(computeFlightTransform(centre, anchor));
                }
            }
            setAnchorTransform(transform);
        }
        if (phase === 'expanding') {
            setTransition(false);
            setPose('anchor');
            const id = requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                    setTransition(true);
                    setPose('center');
                }),
            );
            return () => cancelAnimationFrame(id);
        }
        setTransition(true);
        setPose(phase === 'docking' ? 'anchor' : 'center');
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phase]);

    if (!OBJECTIVES_POPOVER_ENABLED || isInvisiblePhase(phase) || typeof document === 'undefined') {
        return null;
    }

    const modal = phase === 'intro';
    const victoryText = phase === 'victoryText' || phase === 'fadingOut';
    const atAnchor = pose === 'anchor';
    // Reduced motion: no travel, just fade (docking fades out in place; expanding fades in in place).
    const transform = atAnchor && !reduced ? anchorTransform : 'none';
    const opacity = phase === 'fadingOut' || (atAnchor && reduced) ? 0 : 1;
    const flightCss = reduced ? 'opacity 350ms ease-out' : 'transform 450ms ease-in-out, opacity 450ms ease-in-out';
    const transitionCss = !transition
        ? 'none'
        : phase === 'fadingOut'
          ? `opacity ${OBJECTIVES_POPOVER_TIMINGS.fadingOut}ms ease-out`
          : flightCss;

    const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget || !onPhaseAnimationEnd) {
            return;
        }
        if (phase !== 'docking' && phase !== 'expanding' && phase !== 'fadingOut') {
            return;
        }
        if (endedPhaseRef.current === phase) {
            return;
        }
        endedPhaseRef.current = phase;
        onPhaseAnimationEnd(phase);
    };

    const completedNow = new Set(state.activeDiff?.newlyCompleted ?? []);
    const revealedNow = new Set(state.activeDiff?.newlyRevealed ?? []);

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            style={{ pointerEvents: modal ? 'auto' : 'none' }}
        >
            {modal && <div className="absolute inset-0 bg-black/60" aria-hidden />}
            <div
                ref={cardRef}
                data-testid={TestIds.objectivesPopover}
                data-phase={phase}
                role="dialog"
                aria-label="Mission objectives"
                onTransitionEnd={handleTransitionEnd}
                className="relative w-[min(420px,90vw)] rounded-lg border border-white bg-dark-800 px-4 py-3 shadow-2xl"
                style={{ transform, opacity, transition: transitionCss, transformOrigin: 'top left' }}
            >
                <div className="relative mb-2 h-5 text-xs font-semibold uppercase tracking-wide">
                    <span
                        className="absolute inset-0 text-gray-500"
                        style={{ opacity: victoryText ? 0 : 1, transition: 'opacity 300ms ease-out' }}
                    >
                        Objectives
                    </span>
                    <span
                        className="absolute inset-0 text-base text-amber-300"
                        style={{ opacity: victoryText ? 1 : 0, transition: 'opacity 400ms ease-out' }}
                    >
                        Victory
                    </span>
                </div>
                <ul className="flex flex-col gap-1">
                    {state.displayRows.map((row, i) => (
                        <PopoverRow
                            key={row.id}
                            row={row}
                            animateCheck={
                                ((phase === 'checking' || phase === 'sliding') && completedNow.has(row.id)) ||
                                phase === 'victoryCrossing'
                            }
                            checkDelayMs={phase === 'victoryCrossing' ? i * 120 : 0}
                            sliding={phase === 'sliding' && completedNow.has(row.id)}
                            fadeIn={phase === 'revealing' && revealedNow.has(row.id)}
                            reduced={reduced}
                        />
                    ))}
                </ul>
                {phase === 'intro' && (
                    <div className="mt-3 flex justify-end">
                        <button
                            type="button"
                            data-testid={TestIds.objectivesPopoverStart}
                            onClick={onStart}
                            className="rounded-md border border-emerald-600/80 bg-green-900/40 px-4 py-1.5 text-sm font-semibold text-green-300 hover:bg-green-800/50"
                        >
                            Start
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
