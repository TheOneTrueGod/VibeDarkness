import React from 'react';
import type { RefObject } from 'react';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { BattleSession } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import type { BattleOrder, OrderWaiter } from '../../../game/types';
import { useAutoEndTurn } from '../../components/useAutoEndTurn';
import CornerSlotPlayerStats from '../../components/battleUiSlots/CornerSlotPlayerStats';
import RowSlotAbilities from '../../components/battleUiSlots/RowSlotAbilities';
import CornerSlotMiscControls from '../../components/battleUiSlots/CornerSlotMiscControls';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

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
    setIsWaitHovered: (hovered: boolean) => void;
    setHoveredAbility: (ability: AbilityStatic | null) => void;
    /** The turn indicator plaque (and ITS playahead controls); pinned to the top of the ability row. */
    turnIndicator?: React.ReactNode;
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
    setIsWaitHovered,
    setHoveredAbility,
    turnIndicator,
}: BattleAbilityBarProps): BattleAbilityBarSlots {
    const autoEndTurn = useAutoEndTurn();

    if (!engine) {
        return { bottomLeftCorner: null, bottomRow: null, bottomRightCorner: null };
    }

    const pausedAbility = activeLocalWaiter != null
        ? engine.getUnit(activeLocalWaiter.unitId)?.activeAbilities.find((a) => a.conditionalCancelPaused)
        : undefined;
    const conditionalCancelContext = pausedAbility != null
        ? { activeAbilityId: pausedAbility.abilityId, abilityTagFilter: pausedAbility.conditionalCancelTagFilter }
        : undefined;

    const playerUnit =
        (activeLocalWaiter != null
            ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
            : engine.getLocalPlayerUnit()) ?? null;
    const isItsPreviewActive = interactiveTargetingState !== 'inactive';
    const isMyTurn = canUseOrderUi && !isItsPreviewActive;
    const onWait = nonconfirmedOrder && !autoEndTurn
        ? () => sessionRef.current?.getInteractionManager()?.handleEndTurn()
        : () => sessionRef.current?.getInteractionManager()?.handleWait();

    return {
        bottomLeftCorner: <CornerSlotPlayerStats unit={playerUnit} />,
        bottomRow: (
            <RowSlotAbilities
                abilityIds={myAbilityIds}
                playerUnit={playerUnit}
                isMyTurn={isMyTurn}
                roundNumber={roundNumber}
                selectedCardIndex={selectedCardIndex}
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
                turnIndicator={turnIndicator}
            />
        ),
        bottomRightCorner: (
            <CornerSlotMiscControls
                playerUnit={playerUnit}
                isMyTurn={isMyTurn}
                waitDisabledReason={isItsPreviewActive ? 'its_preview_active' : null}
                roundNumber={roundNumber}
                roundProgress={roundProgress}
                isPaused={isPaused}
                onWait={onWait}
                hasNonconfirmedOrder={!autoEndTurn && !!nonconfirmedOrder}
                onWaitHoverChange={setIsWaitHovered}
                conditionalCancelContext={conditionalCancelContext}
            />
        ),
    };
}
