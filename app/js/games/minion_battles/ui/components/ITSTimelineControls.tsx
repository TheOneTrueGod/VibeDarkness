import React, { useEffect, useReducer, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Undo2, RotateCw, Check } from 'lucide-react';
import type { BattleSession } from '../../game/BattleSession';
import { ONLY_UNDO_AT_START } from '../../game/gameConstants';
import { setAutoEndTurn } from '../../game/autoEndTurnSetting';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getTotalAbilityDurationForCast } from '../../abilities/abilityTimings';
import type { ItsPlayaheadTicks } from './GameTickPill';
import ITSTimelineFrameStepper from './ITSTimelineFrameStepper';
import { useAutoEndTurn } from './useAutoEndTurn';
import {
    AnchoredPortalTooltip,
} from './AnchoredPortalTooltip';
import {
    FRAMES_PER_PIP,
    abilityDurationSecondsToTicks,
} from './itsTimelineMath';
import {
    isEscapeItsUndoHotkey,
    isItsUndoDisabled,
    isKeyboardEventFromTextInput,
} from './itsUndoHotkey';

/** Fixed row height so the turn-indicator plaque does not grow. */
const ITS_CONTROLS_HEIGHT_PX = 20;

/** Fallback scrub length when the parent does not pass {@link ITSTimelineControlsProps.rewindDurationMs}. */
const DEFAULT_REWIND_SCRUB_MS = 1000;

const TOOLTIP_SHOW_DELAY_MS = 80;

interface ItsIconButtonProps {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    className: string;
    iconClassName: string;
    /** When true, render {@link label} as visible text beside the icon. */
    showText?: boolean;
    tooltip?: string;
    ariaKeyShortcuts?: string;
}

/** Compact icon control with a fast hover tooltip. */
function ItsIconButton({
    label,
    icon: Icon,
    onClick,
    disabled = false,
    className,
    iconClassName,
    showText = false,
    tooltip,
    ariaKeyShortcuts,
}: ItsIconButtonProps) {
    const [tooltipVisible, setTooltipVisible] = useState(false);
    const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);

    const clearShowTimer = () => {
        if (showTimerRef.current != null) {
            clearTimeout(showTimerRef.current);
            showTimerRef.current = null;
        }
    };

    useEffect(() => clearShowTimer, []);

    return (
        <div className="relative shrink-0">
            <button
                ref={buttonRef}
                type="button"
                aria-label={label}
                aria-keyshortcuts={ariaKeyShortcuts}
                disabled={disabled}
                onClick={onClick}
                onMouseEnter={() => {
                    clearShowTimer();
                    showTimerRef.current = setTimeout(() => {
                        showTimerRef.current = null;
                        setTooltipVisible(true);
                    }, TOOLTIP_SHOW_DELAY_MS);
                }}
                onMouseLeave={() => {
                    clearShowTimer();
                    setTooltipVisible(false);
                }}
                className={`flex h-5 items-center justify-center rounded-sm border transition-opacity ${
                    showText ? 'gap-0.5 px-1' : 'w-5'
                } ${className} ${
                    disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:opacity-90'
                }`}
            >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClassName}`} strokeWidth={2.25} aria-hidden />
                {showText ? (
                    <span className={`text-[10px] font-semibold leading-none ${iconClassName}`}>
                        {label}
                    </span>
                ) : null}
            </button>
            <AnchoredPortalTooltip
                anchorRef={buttonRef}
                open={tooltipVisible}
                className="px-1.5 py-0.5 text-[10px] whitespace-nowrap"
            >
                {tooltip ?? label}
            </AnchoredPortalTooltip>
        </div>
    );
}

/** Session-only toggle for {@link setAutoEndTurn}; unchecked shows the manual Done button. */
function AutoEndCheckbox({ checked }: { checked: boolean }) {
    return (
        <label
            className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded-sm border border-dark-600 bg-dark-800 px-1 text-[10px] font-medium text-gray-300 hover:bg-dark-700"
            title="Automatically end your turn once orders are submitted (this session only)"
        >
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setAutoEndTurn(e.target.checked)}
                className="h-3 w-3 accent-emerald-500"
            />
            Auto End
        </label>
    );
}

/** Snapshot frozen at rewind start so the bar stays stable after ITS clears. */
interface RewindScrubSnapshot {
    fromTick: number;
    toTick: number;
    highWaterTick: number;
    startTick: number;
    expectedDurationTicks: number;
}

export interface ITSTimelineControlsProps {
    state: 'playing' | 'paused' | 'done';
    sessionRef: React.RefObject<BattleSession | null>;
    getItsPlayaheadTicks: () => ItsPlayaheadTicks | null;
    setOrderSubmitFailed: (v: boolean) => void;
    autoCommitItsAttemptedRef: React.MutableRefObject<boolean>;
    /** Non-null while the DOM rewind overlay is showing; changes restart the rewind scrub. */
    rewindToken?: number | null;
    /**
     * Peak mark/playahead (+ span meta) captured at rewind emit before engine restore.
     */
    rewindSeed?: (ItsPlayaheadTicks & {
        expectedDurationTicks: number;
    }) | null;
    /** Duration of the rewind scrub animation (should match the DOM overlay fade). */
    rewindDurationMs?: number;
}

function readAbilityTimelineMeta(sessionRef: React.RefObject<BattleSession | null>): {
    expectedDurationTicks: number;
} {
    const session = sessionRef.current;
    const its = session?.interactiveTargeting;
    const engine = session?.getEngine();
    if (!its?.isActive || engine == null || its.abilityId == null || its.unitId == null) {
        return { expectedDurationTicks: 0 };
    }
    const ability = getAbility(its.abilityId);
    const caster = engine.getUnit(its.unitId);
    if (!ability || !caster) {
        return { expectedDurationTicks: 0 };
    }
    try {
        const durationSec = getTotalAbilityDurationForCast(ability, caster, engine);
        return {
            expectedDurationTicks: abilityDurationSecondsToTicks(durationSec),
        };
    } catch {
        return { expectedDurationTicks: 0 };
    }
}

/**
 * ITS Reset / Replay / timeline / Done row that replaces “Your Turn” text in the turn indicator.
 * Height is fixed so the plaque layout does not shift.
 */
export default function ITSTimelineControls({
    state,
    sessionRef,
    getItsPlayaheadTicks,
    setOrderSubmitFailed,
    autoCommitItsAttemptedRef,
    rewindToken = null,
    rewindSeed = null,
    rewindDurationMs = DEFAULT_REWIND_SCRUB_MS,
}: ITSTimelineControlsProps) {
    const [, forceRerender] = useReducer((x: number) => x + 1, 0);
    const highWaterRef = useRef(0);
    const displayTickRef = useRef(0);
    const startTickRef = useRef(0);
    const expectedDurationRef = useRef(0);
    const [displayTick, setDisplayTick] = useState(0);
    const [rewinding, setRewinding] = useState(false);
    const [scrub, setScrub] = useState<RewindScrubSnapshot | null>(null);

    const ticks = getItsPlayaheadTicks();

    useEffect(() => {
        const id = window.setInterval(() => {
            const latest = getItsPlayaheadTicks();
            if (latest != null) {
                startTickRef.current = latest.savedLocalTick;
                if (!rewinding) {
                    if (latest.playaheadTick >= displayTickRef.current) {
                        highWaterRef.current = Math.max(highWaterRef.current, latest.playaheadTick);
                        displayTickRef.current = latest.playaheadTick;
                    } else {
                        // Engine restored to the mark before the scrub effect runs.
                        highWaterRef.current = Math.max(highWaterRef.current, displayTickRef.current);
                    }
                }
                const meta = readAbilityTimelineMeta(sessionRef);
                if (meta.expectedDurationTicks > 0) {
                    expectedDurationRef.current = meta.expectedDurationTicks;
                }
            }
            forceRerender();
        }, 50);
        return () => window.clearInterval(id);
    }, [getItsPlayaheadTicks, rewinding, sessionRef]);

    useEffect(() => {
        // Hold timeline state while a rewind token is present or scrub is running —
        // ITS often clears in the same turn as the overlay, which would otherwise
        // zero the refs and collapse the bar to a single red pip.
        if (rewinding || scrub != null || rewindToken != null) return;
        if (ticks == null) {
            highWaterRef.current = 0;
            displayTickRef.current = 0;
            startTickRef.current = 0;
            setDisplayTick(0);
            return;
        }
        setDisplayTick(displayTickRef.current);
    }, [ticks, rewinding, scrub, rewindToken]);

    // Reset high-water when a new ITS mark begins.
    const prevStartTickRef = useRef<number | null>(null);
    useEffect(() => {
        if (ticks == null) {
            if (!rewinding && scrub == null) {
                prevStartTickRef.current = null;
            }
            return;
        }
        if (prevStartTickRef.current != null && prevStartTickRef.current !== ticks.savedLocalTick) {
            highWaterRef.current = ticks.playaheadTick;
            displayTickRef.current = ticks.playaheadTick;
            setDisplayTick(ticks.playaheadTick);
        }
        prevStartTickRef.current = ticks.savedLocalTick;
    }, [ticks, rewinding, scrub]);

    useEffect(() => {
        if (rewindToken == null) {
            setScrub(null);
            setRewinding(false);
            return;
        }

        const seedStart = rewindSeed?.savedLocalTick;
        const seedPeak = rewindSeed?.playaheadTick;
        const toTick = seedStart ?? startTickRef.current;
        const fromTick = Math.max(
            displayTickRef.current,
            highWaterRef.current,
            seedPeak ?? toTick,
            toTick,
        );
        const snapshot: RewindScrubSnapshot = {
            fromTick,
            toTick,
            highWaterTick: Math.max(highWaterRef.current, fromTick, seedPeak ?? fromTick),
            startTick: toTick,
            expectedDurationTicks:
                rewindSeed?.expectedDurationTicks && rewindSeed.expectedDurationTicks > 0
                    ? rewindSeed.expectedDurationTicks
                    : expectedDurationRef.current,
        };

        setRewinding(true);
        setScrub(snapshot);
        highWaterRef.current = snapshot.highWaterTick;
        startTickRef.current = toTick;
        displayTickRef.current = fromTick;
        setDisplayTick(fromTick);

        // Degenerate: nothing to scrub (already at mark).
        if (fromTick <= toTick) {
            setRewinding(false);
            return;
        }

        const startedAt = performance.now();
        let raf = 0;
        const step = (now: number) => {
            const t = Math.min(1, (now - startedAt) / rewindDurationMs);
            const next = Math.round(fromTick + (toTick - fromTick) * t);
            displayTickRef.current = next;
            setDisplayTick(next);
            if (t < 1) {
                raf = requestAnimationFrame(step);
            } else {
                setRewinding(false);
            }
        };
        raf = requestAnimationFrame(step);
        return () => {
            cancelAnimationFrame(raf);
        };
    }, [rewindToken, rewindDurationMs, rewindSeed]);

    const startTick = scrub?.startTick ?? (ticks?.savedLocalTick ?? startTickRef.current);
    const highWaterTick = scrub?.highWaterTick
        ?? Math.max(highWaterRef.current, displayTick, startTick);
    const expectedDurationTicks = scrub?.expectedDurationTicks ?? expectedDurationRef.current;
    const autoEndTurn = useAutoEndTurn();
    const showDone = !autoEndTurn;
    const isRewindCrossfade = rewinding || scrub != null || rewindToken != null;
    const doneDisabled = state !== 'done' || isRewindCrossfade;
    const hasCollectedTargets = Object.keys(sessionRef.current?.interactiveTargeting.collectedTargets ?? {}).length > 0;
    const undoDisabled = isItsUndoDisabled({
        isRewindCrossfade,
        onlyUndoAtStart: ONLY_UNDO_AT_START,
        hasCollectedTargets,
    });

    const undoDisabledRef = useRef(undoDisabled);
    undoDisabledRef.current = undoDisabled;

    const performUndo = () => {
        if (undoDisabledRef.current) return;
        setOrderSubmitFailed(false);
        const s = sessionRef.current;
        if (s) void s.interactiveTargeting.reset(s);
    };

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (!isEscapeItsUndoHotkey(e)) return;
            if (isKeyboardEventFromTextInput(e)) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (undoDisabledRef.current) return;
            setOrderSubmitFailed(false);
            const s = sessionRef.current;
            if (s) void s.interactiveTargeting.reset(s);
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }, [sessionRef, setOrderSubmitFailed]);

    return (
        <div
            className="flex w-full max-w-full items-center gap-1.5"
            style={{ height: ITS_CONTROLS_HEIGHT_PX }}
            aria-label="Interactive targeting controls"
        >
            <ItsIconButton
                label="Undo"
                tooltip="Undo (Esc)"
                ariaKeyShortcuts="Escape"
                icon={Undo2}
                showText
                className="border-red-700 bg-red-900/60"
                iconClassName="text-red-300"
                disabled={undoDisabled}
                onClick={performUndo}
            />
            <ItsIconButton
                label="Replay"
                icon={RotateCw}
                className="border-sky-700 bg-sky-900/60"
                iconClassName="text-sky-300"
                disabled={isRewindCrossfade}
                onClick={() => {
                    setOrderSubmitFailed(false);
                    const s = sessionRef.current;
                    if (s) void s.interactiveTargeting.replay(s);
                }}
            />
            <ITSTimelineFrameStepper
                startTick={startTick}
                currentTick={displayTick}
                highWaterTick={highWaterTick}
                expectedDurationTicks={expectedDurationTicks}
                framesPerPip={FRAMES_PER_PIP}
            />
            {showDone ? (
                <ItsIconButton
                    label="Done"
                    icon={Check}
                    showText
                    disabled={doneDisabled}
                    className={
                        !doneDisabled
                            ? 'border-emerald-600 bg-emerald-600'
                            : 'border-dark-600 bg-dark-800'
                    }
                    iconClassName={!doneDisabled ? 'text-white' : 'text-gray-500'}
                    onClick={() => {
                        setOrderSubmitFailed(false);
                        autoCommitItsAttemptedRef.current = true;
                        const s = sessionRef.current;
                        if (s) void s.interactiveTargeting.commit(s, 'ui_done');
                    }}
                />
            ) : null}
            <AutoEndCheckbox checked={autoEndTurn} />
        </div>
    );
}
