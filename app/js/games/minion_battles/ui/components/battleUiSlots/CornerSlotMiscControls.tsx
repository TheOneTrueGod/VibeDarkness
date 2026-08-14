/**
 * CornerSlotMiscControls - the Bottom-Right Corner slot's content: the Wait/End Turn button
 * and the round tracker. Extracted from the old AbilityBar's right column.
 */
import React, { useCallback } from 'react';
import RoundTrackerCard from '../RoundTrackerCard';
import { DEFAULT_PLAYER_ROUND_STAMINA_SURGE } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import { TestIds } from '../../../../../testing/testIds';
import {
    WAIT_ABILITY_MODE_FAR,
    WAIT_ABILITY_MODE_LABELS,
    WAIT_ABILITY_MODE_MEDIUM,
    WAIT_ABILITY_MODE_SHORT,
    WAIT_ABILITY_MODES,
    WaitAbility,
} from '../../../abilities/WaitAbility';

/** Matches `h-6` on the S/M/F mode toggle buttons. */
const WAIT_MODE_TOGGLE_HEIGHT_PX = 24;
const WAIT_COLUMN_HEIGHT_PX = 126;
const WAIT_CARD_HEIGHT_PX = 96;
const WAIT_CARD_WIDTH_PX = 80;

function waitModeTitle(mode: string): string {
    switch (mode) {
        case WAIT_ABILITY_MODE_SHORT:
            return 'Short — wait 1 second';
        case WAIT_ABILITY_MODE_MEDIUM:
            return 'Medium — wait 2 seconds';
        case WAIT_ABILITY_MODE_FAR:
            return 'Far — wait until arrival or enemy damage (min 1s)';
        default:
            return mode;
    }
}

interface CornerSlotMiscControlsProps {
    playerUnit: Unit | null;
    isMyTurn: boolean;
    /** When set, Wait is disabled for this reason (tooltip); ITS preview is the main case. */
    waitDisabledReason?: 'its_preview_active' | null;
    roundNumber: number;
    roundProgress: number;
    isPaused: boolean;
    onWait?: () => void;
    /** When true, the wait button renders as "End Turn" to confirm a nonconfirmed order. */
    hasNonconfirmedOrder?: boolean;
    onWaitHoverChange?: (hovered: boolean) => void;
    conditionalCancelContext?: {
        activeAbilityId: string;
        abilityTagFilter?: readonly string[];
    };
    /** Current Wait ability mode (short / medium / far). */
    waitAbilityMode?: string;
    onSetWaitAbilityMode?: (mode: string) => void;
}

export default function CornerSlotMiscControls({
    playerUnit,
    isMyTurn,
    waitDisabledReason = null,
    roundNumber,
    roundProgress,
    isPaused,
    onWait,
    hasNonconfirmedOrder,
    onWaitHoverChange,
    conditionalCancelContext,
    waitAbilityMode,
    onSetWaitAbilityMode,
}: CornerSlotMiscControlsProps) {
    const handleSelectMode = useCallback((mode: string, e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onSetWaitAbilityMode?.(mode);
    }, [onSetWaitAbilityMode]);

    if (!playerUnit) return null;

    const isPlainWait = !conditionalCancelContext && !hasNonconfirmedOrder;
    const currentMode =
        waitAbilityMode
        ?? WaitAbility.abilityModes?.defaultMode
        ?? WAIT_ABILITY_MODE_SHORT;
    const showModeToggle = Boolean(
        isMyTurn && isPlainWait && onSetWaitAbilityMode && WaitAbility.abilityModes,
    );

    const waitTitle = !isMyTurn && waitDisabledReason === 'its_preview_active'
        ? 'Wait unavailable during targeting preview (Undo to cancel)'
        : conditionalCancelContext
          ? 'Continue current ability (Space)'
          : hasNonconfirmedOrder
            ? 'End Turn (Space)'
            : 'Wait (Space)';

    return (
        <div className="flex h-full w-full items-start gap-2">
            <div
                className="relative flex flex-shrink-0 flex-col items-stretch justify-end gap-1.5"
                style={{ width: WAIT_CARD_WIDTH_PX, height: WAIT_COLUMN_HEIGHT_PX }}
                onPointerEnter={() => onWaitHoverChange?.(true)}
                onPointerLeave={() => onWaitHoverChange?.(false)}
            >
                {showModeToggle && (
                    <div
                        className="flex w-full items-center justify-between gap-1"
                        role="group"
                        aria-label="Wait duration mode"
                    >
                        {WAIT_ABILITY_MODES.map((mode) => {
                            const label = WAIT_ABILITY_MODE_LABELS[mode];
                            const selected = currentMode === mode;
                            const title = waitModeTitle(mode);
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    data-testid={`${TestIds.battleWait}-mode-${mode}`}
                                    title={title}
                                    aria-label={title}
                                    aria-pressed={selected}
                                    onClick={(e) => handleSelectMode(mode, e)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            handleSelectMode(mode, e);
                                        }
                                    }}
                                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded border text-[11px] font-semibold uppercase leading-none transition-colors ${
                                        selected
                                            ? 'border-violet-300 bg-violet-900 text-violet-100'
                                            : 'border-dark-500 bg-dark-800 text-gray-300 hover:border-gray-400 hover:bg-dark-700'
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    data-testid={TestIds.battleWait}
                    onClick={onWait}
                    disabled={!isMyTurn}
                    aria-label={
                        conditionalCancelContext
                            ? 'Continue'
                            : hasNonconfirmedOrder
                              ? 'End Turn'
                              : 'Wait'
                    }
                    className={`flex w-full flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                        isMyTurn
                            ? 'cursor-pointer border-dark-500 bg-dark-700 text-gray-200 hover:-translate-y-1 hover:border-gray-400 hover:bg-dark-600'
                            : 'cursor-not-allowed border-dark-700 bg-dark-800 text-gray-600'
                    }`}
                    style={{ height: WAIT_CARD_HEIGHT_PX }}
                    title={waitTitle}
                    aria-keyshortcuts="Space"
                >
                    <span className="text-sm font-medium">
                        {conditionalCancelContext ? 'Continue' : hasNonconfirmedOrder ? 'End Turn' : 'Wait'}
                    </span>
                    <kbd
                        aria-hidden="true"
                        className={`mt-2 flex h-10 min-w-[3.5rem] items-center justify-center rounded border-2 px-2 font-mono text-[11px] font-semibold tracking-wide shadow-inner ${
                            isMyTurn
                                ? 'border-gray-500 bg-dark-800 text-gray-200'
                                : 'border-dark-600 bg-dark-900 text-gray-500'
                        }`}
                    >
                        Space
                    </kbd>
                </button>
            </div>
            <div style={{ marginTop: WAIT_MODE_TOGGLE_HEIGHT_PX }}>
                <RoundTrackerCard
                    roundNumber={roundNumber}
                    progress={roundProgress}
                    isPaused={isPaused}
                    staminaSurge={playerUnit.stamina ?? DEFAULT_PLAYER_ROUND_STAMINA_SURGE}
                />
            </div>
        </div>
    );
}
