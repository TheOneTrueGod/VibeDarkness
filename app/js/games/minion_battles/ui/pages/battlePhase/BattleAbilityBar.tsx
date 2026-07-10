import React from 'react';
import type { RefObject } from 'react';
import type { AbilityStatic } from '../../../abilities/Ability';
import type { BattleSession } from '../../../game/BattleSession';
import type { GameEngine } from '../../../game/GameEngine';
import type { BattleOrder, OrderWaiter } from '../../../game/types';
import { AUTO_END_TURN } from '../../../game/gameConstants';
import AbilityBar from '../../components/AbilityBar';
import type { HudEffectCanvasHandle } from '../../components/HudEffectCanvas';

interface BattleAbilityBarProps {
    sessionRef: RefObject<BattleSession | null>;
    hudEffectCanvasRef: RefObject<HudEffectCanvasHandle | null>;
    engine: GameEngine;
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
}

export default function BattleAbilityBar({
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
}: BattleAbilityBarProps) {
    const pausedAbility = activeLocalWaiter != null
        ? engine.getUnit(activeLocalWaiter.unitId)?.activeAbilities.find((a) => a.conditionalCancelPaused)
        : undefined;
    const conditionalCancelContext = pausedAbility != null
        ? { activeAbilityId: pausedAbility.abilityId, abilityTagFilter: pausedAbility.conditionalCancelTagFilter }
        : undefined;

    return (
        <AbilityBar
            abilityIds={myAbilityIds}
            playerUnit={
                (activeLocalWaiter != null
                    ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
                    : engine.getLocalPlayerUnit()) ?? null
            }
            isMyTurn={canUseOrderUi && interactiveTargetingState === 'inactive'}
            roundNumber={roundNumber}
            roundProgress={roundProgress}
            isPaused={isPaused}
            selectedCardIndex={selectedCardIndex}
            onSelectCard={(cardIndex, ability) =>
                sessionRef.current?.getInteractionManager()?.activateAbilityTargeting(cardIndex, ability)
            }
            onWait={nonconfirmedOrder && !AUTO_END_TURN
                ? () => sessionRef.current?.getInteractionManager()?.handleEndTurn()
                : () => sessionRef.current?.getInteractionManager()?.handleWait()
            }
            hasNonconfirmedOrder={!AUTO_END_TURN && !!nonconfirmedOrder}
            onWaitHoverChange={setIsWaitHovered}
            gameState={engine}
            allUnits={engine.units}
            conditionalCancelContext={conditionalCancelContext}
            abilityModeByAbilityId={abilityModeByAbilityId}
            onCycleAbilityMode={handleCycleAbilityMode}
            onRegisterCardTarget={(key, pageX, pageY) => {
                hudEffectCanvasRef.current?.registerHudFlightTarget(key, pageX, pageY);
            }}
            onHoverAbility={setHoveredAbility}
        />
    );
}
