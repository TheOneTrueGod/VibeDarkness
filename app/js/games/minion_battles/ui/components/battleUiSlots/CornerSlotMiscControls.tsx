/**
 * CornerSlotMiscControls - the Bottom-Right Corner slot's content: the Wait/End Turn button
 * and the round tracker. Extracted from the old AbilityBar's right column.
 */
import React from 'react';
import RoundTrackerCard from '../RoundTrackerCard';
import { DEFAULT_PLAYER_ROUND_STAMINA_SURGE } from '../../../game/GameEngine';
import type { Unit } from '../../../game/units/Unit';
import { TestIds } from '../../../../../testing/testIds';

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
}: CornerSlotMiscControlsProps) {
    if (!playerUnit) return null;

    const waitTitle = !isMyTurn && waitDisabledReason === 'its_preview_active'
        ? 'Wait unavailable during targeting preview (Undo to cancel)'
        : conditionalCancelContext
          ? 'Continue current ability (Space)'
          : hasNonconfirmedOrder
            ? 'End Turn (Space)'
            : 'Wait (Space)';

    return (
        <div className="flex h-full w-full items-start gap-2">
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
                className={`flex h-[104px] w-[80px] flex-shrink-0 flex-col items-center justify-center rounded-lg border-2 transition-all duration-150 ${
                    isMyTurn
                        ? 'cursor-pointer border-dark-500 bg-dark-700 text-gray-200 hover:-translate-y-1 hover:border-gray-400 hover:bg-dark-600'
                        : 'cursor-not-allowed border-dark-700 bg-dark-800 text-gray-600'
                }`}
                title={waitTitle}
                aria-keyshortcuts="Space"
                onPointerEnter={() => onWaitHoverChange?.(true)}
                onPointerLeave={() => onWaitHoverChange?.(false)}
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
            <RoundTrackerCard
                roundNumber={roundNumber}
                progress={roundProgress}
                isPaused={isPaused}
                staminaSurge={playerUnit.stamina ?? DEFAULT_PLAYER_ROUND_STAMINA_SURGE}
            />
        </div>
    );
}
