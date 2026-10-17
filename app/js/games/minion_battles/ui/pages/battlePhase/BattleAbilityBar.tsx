import React from 'react';
import type { RefObject } from 'react';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { BattleSession } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import type { BattleOrder, OrderWaiter } from '../../../game/types';
import { getConditionalCancelDecisionCast, isAtMissingPickDecision } from '../../../game/interaction/isITSPreviewComplete';
import { useAutoEndTurn } from '../../components/useAutoEndTurn';
import CornerSlotPlayerStats from '../../components/battleUiSlots/CornerSlotPlayerStats';
import RowSlotAbilities from '../../components/battleUiSlots/RowSlotAbilities';
import CornerSlotMiscControls from '../../components/battleUiSlots/CornerSlotMiscControls';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';
import type { TurnIndicatorPassAction, TurnIndicatorSideControls } from '../../components/TurnIndicator';

interface BattleAbilityBarProps {
    sessionRef: RefObject<BattleSession | null>;
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>;
    /** Null before the battle session/engine finishes initializing; slots render empty until then. */
    engine: GameEngine | null;
    myAbilityIds: string[];
    activeLocalWaiter: OrderWaiter | null;
    canUseOrderUi: boolean;
    interactiveTargetingState: 'inactive' | 'playing' | 'paused' | 'done';
    roundNumber: number;
    roundProgress: number;
    isPaused: boolean;
    selectedCardIndex: number | null;
    nonconfirmedOrder: BattleOrder | null;
    abilityModeByAbilityId: Record<string, string>;
    handleCycleAbilityMode: (abilityId: string, modes: readonly string[]) => void;
    handleSetAbilityMode: (abilityId: string, mode: string) => void;
    setIsWaitHovered: (hovered: boolean) => void;
    setHoveredAbility: (ability: AbilityStatic | null) => void;
    /**
     * Renders the turn indicator plaque (and ITS playahead controls), pinned to the top of the
     * ability row. Receives the plaque's round pill and Pass action (which mirrors the Wait button).
     */
    renderTurnIndicator?: (sideControls: TurnIndicatorSideControls) => React.ReactNode;
}

interface BattleAbilityBarSlots {
    bottomLeftCorner: React.ReactNode;
    bottomRow: React.ReactNode;
    bottomRightCorner: React.ReactNode;
}

/** Computes the bottom-band slot content (player stats / ability hand / wait + round tracker). */
export function useBattleAbilityBarSlots({
    sessionRef,
    hudEffectCanvasRef,
    engine,
    myAbilityIds,
    activeLocalWaiter,
    canUseOrderUi,
    interactiveTargetingState,
    roundNumber,
    roundProgress,
    isPaused,
    selectedCardIndex,
    nonconfirmedOrder,
    abilityModeByAbilityId,
    handleCycleAbilityMode,
    handleSetAbilityMode,
    setIsWaitHovered,
    setHoveredAbility,
    renderTurnIndicator,
}: BattleAbilityBarProps): BattleAbilityBarSlots {
    const autoEndTurn = useAutoEndTurn();

    if (!engine) {
        return { bottomLeftCorner: null, bottomRow: null, bottomRightCorner: null };
    }

    const its = sessionRef.current?.interactiveTargeting;
    // Same resolver as PlayerInteractionManager.handleWait, so Pass is only enabled when it will act.
    const pausedAbility = activeLocalWaiter != null
        ? getConditionalCancelDecisionCast(
              engine,
              activeLocalWaiter.unitId,
              its ?? { isActive: false, previewOrderQueued: false },
          )
        : undefined;
    const forceItsCommitAtCombo = its?.shouldForceItsCommitAtComboWindow() === true;
    const conditionalCancelContext = pausedAbility != null && !forceItsCommitAtCombo
        ? { activeAbilityId: pausedAbility.abilityId, abilityTagFilter: pausedAbility.conditionalCancelTagFilter }
        : undefined;

    const playerUnit =
        (activeLocalWaiter != null
            ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
            : engine.getLocalPlayerUnit()) ?? null;
    const isItsPreviewActive = interactiveTargetingState !== 'inactive';
    const isConditionalCancelPause = conditionalCancelContext != null;
    // Missing-pick pause (or its ITS resume preview): ability cards stay locked, but Pass is enabled and
    // fizzles the cast. The pick itself is made on the canvas through ITS resume mode.
    const atMissingPickDecision =
        canUseOrderUi
        && ((activeLocalWaiter != null && isAtMissingPickDecision(engine, activeLocalWaiter.unitId))
            || sessionRef.current?.interactiveTargeting.isResumeMode === true);
    const isMyTurn =
        canUseOrderUi && !atMissingPickDecision && (!isItsPreviewActive || isConditionalCancelPause);
    // Ended-early preview at its stop point (Done): Pass commits that timeline. It only waits here when
    // Undo is allowed; otherwise it already auto-committed (shouldAutoCommitItsPreview).
    const atEndedEarlyDone =
        interactiveTargetingState === 'done'
        && sessionRef.current?.interactiveTargeting.getPreviewCastEndedEarly(engine) != null;
    const passEnabled = isMyTurn || atMissingPickDecision || atEndedEarlyDone;
    const onWait = nonconfirmedOrder && !autoEndTurn && !atEndedEarlyDone
        ? () => sessionRef.current?.getInteractionManager()?.handleEndTurn()
        : () => sessionRef.current?.getInteractionManager()?.handleWait();
    const waitDisabledReason =
        isItsPreviewActive && !conditionalCancelContext && !atMissingPickDecision ? 'its_preview_active' : null;
    const passAction: TurnIndicatorPassAction = {
        onPass: onWait,
        disabled: !passEnabled,
        title: atEndedEarlyDone
            ? 'Pass: commit this timeline (Space)'
            : atMissingPickDecision
            ? 'Pass: skip the pick (the ability fizzles)'
            : !isMyTurn
              ? waitDisabledReason === 'its_preview_active'
                  ? 'Pass unavailable during targeting preview (Undo to cancel)'
                  : 'Not your turn'
              : conditionalCancelContext
                ? 'Pass: continue current ability (Space)'
                : nonconfirmedOrder && !autoEndTurn
                  ? 'Pass: end turn (Space)'
                  : 'Pass: wait (Space)',
    };
    const sideControls: TurnIndicatorSideControls = {
        passAction,
        roundInfo: { roundNumber, progress: roundProgress, isPaused },
    };

    return {
        bottomLeftCorner: <CornerSlotPlayerStats unit={playerUnit} />,
        bottomRow: (
            <RowSlotAbilities
                abilityIds={myAbilityIds}
                playerUnit={playerUnit}
                isMyTurn={isMyTurn}
                roundNumber={roundNumber}
                selectedCardIndex={selectedCardIndex}
                specialActionAbilityId={nonconfirmedOrder?.specialAction?.abilityId ?? null}
                onSelectCard={(cardIndex, ability) =>
                    sessionRef.current?.getInteractionManager()?.activateAbilityTargeting(cardIndex, ability)
                }
                gameState={engine}
                allUnits={engine.units}
                conditionalCancelContext={conditionalCancelContext}
                abilityModeByAbilityId={abilityModeByAbilityId}
                onCycleAbilityMode={handleCycleAbilityMode}
                onRegisterCardTarget={(key, pageX, pageY) => {
                    hudEffectCanvasRef.current?.registerHudFlightTarget(key, pageX, pageY);
                }}
                onHoverAbility={setHoveredAbility}
                turnIndicator={renderTurnIndicator?.(sideControls)}
            />
        ),
        bottomRightCorner: (
            <CornerSlotMiscControls
                playerUnit={playerUnit}
                isMyTurn={passEnabled}
                waitDisabledReason={waitDisabledReason}
                roundNumber={roundNumber}
                roundProgress={roundProgress}
                isPaused={isPaused}
                onWait={onWait}
                hasNonconfirmedOrder={!autoEndTurn && !!nonconfirmedOrder}
                onWaitHoverChange={setIsWaitHovered}
                conditionalCancelContext={conditionalCancelContext}
                waitAbilityMode={
                    abilityModeByAbilityId.wait
                    ?? undefined
                }
                onSetWaitAbilityMode={
                    atMissingPickDecision ? undefined : (mode) => handleSetAbilityMode('wait', mode)
                }
            />
        ),
    };
}
