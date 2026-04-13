/**
 * CardHand - Renders the player's hand of cards at the bottom of the screen.
 *
 * Manages card selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getAbility } from '../../abilities/AbilityRegistry';
import { canAffordAbility } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit, UnitAbilityRuntimeState } from '../../game/units/Unit';
import CardComponent from './CardComponent';
import CardTooltip from './CardTooltip';

interface CardHandProps {
    abilityIds: string[];
    /** The player's unit (for resource checks). */
    playerUnit: Unit | null;
    /** Whether it's this player's turn to act. */
    isMyTurn: boolean;
    /** Currently selected card index (in the hand), or null. */
    selectedCardIndex: number | null;
    /** Called when a card is selected. */
    onSelectCard: (handIndex: number, ability: AbilityStatic) => void;
    /** Called when the player clicks the Wait button. */
    onWait?: () => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
}

export default function CardHand({
    abilityIds,
    playerUnit,
    isMyTurn,
    selectedCardIndex,
    onSelectCard,
    onWait,
    gameState,
}: CardHandProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

    // Detect mobile via touch support
    useEffect(() => {
        setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    const handCards = useMemo(() => {
        return abilityIds
            .map((abilityId) => {
                const ability = getAbility(abilityId);
                if (!ability || !playerUnit) return null;
                const runtime = playerUnit.abilityRuntime[abilityId] as UnitAbilityRuntimeState | undefined;
                if (!runtime) return null;
                return { abilityId, ability, runtime };
            })
            .filter((entry): entry is { abilityId: string; ability: AbilityStatic; runtime: UnitAbilityRuntimeState } => Boolean(entry));
    }, [abilityIds, playerUnit]);

    useEffect(() => {
        if (hoveredCardId && !handCards.some((card) => card.abilityId === hoveredCardId)) {
            setHoveredCardId(null);
        }
    }, [handCards, hoveredCardId]);

    const handleSelectCard = useCallback(
        (handIndex: number) => {
            const card = handCards[handIndex];
            if (!card) return;
            onSelectCard(handIndex, card.ability);
            setMobileDescIndex(null);
        },
        [handCards, onSelectCard],
    );

    const handleMobileDescToggle = useCallback(
        (index: number) => {
            setMobileDescIndex((prev) => (prev === index ? null : index));
        },
        [],
    );

    const handleMobileDescDismiss = useCallback(() => {
        setMobileDescIndex(null);
    }, []);

    // Get the mobile description ability if showing
    const mobileDescAbility = useMemo(() => {
        if (mobileDescIndex === null) return null;
        const card = handCards[mobileDescIndex];
        if (!card) return null;
        return card.ability;
    }, [mobileDescIndex, handCards]);

    return (
        <div className="relative bg-dark-900/80 border-t border-dark-700 px-4 py-2">
            {playerUnit && playerUnit.resources.length > 0 && (
                <div className="flex items-center justify-center gap-2 mb-2">
                    {playerUnit.resources.map((resource) => (
                        <div
                            key={resource.id}
                            className="px-2 py-0.5 rounded border text-xs"
                            style={{ borderColor: resource.color, color: resource.color }}
                        >
                            {resource.name}: {Math.round(resource.current)}
                        </div>
                    ))}
                </div>
            )}
            {/* Fixed-height row for wait button and ability cards */}
            <div className="flex items-center gap-4 h-[152px]">
                {/* Wait + abilities */}
                {playerUnit && (
                    <>
                        <button
                            onClick={onWait}
                            disabled={!isMyTurn}
                            className={`flex flex-col items-center justify-center w-[80px] h-[104px] rounded-lg border-2 transition-all duration-150 flex-shrink-0 ${
                                isMyTurn
                                    ? 'bg-dark-700 border-dark-500 text-gray-200 hover:bg-dark-600 hover:border-gray-400 hover:-translate-y-1 cursor-pointer'
                                    : 'bg-dark-800 border-dark-700 text-gray-600 cursor-not-allowed'
                            }`}
                            title="Wait (Space)"
                        >
                            <span className="text-sm font-medium">Wait</span>
                            <svg
                                viewBox="0 0 80 20"
                                className="w-12 h-3 mt-1 text-gray-400"
                                aria-hidden
                            >
                                <rect
                                    x="2"
                                    y="2"
                                    width="76"
                                    height="16"
                                    rx="3"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                />
                            </svg>
                        </button>
                    </>
                )}

                {/* Hand cards: max width 800px so bar doesn't grow too wide */}
                <div
                    className="flex gap-2 flex-1 justify-center min-w-0 max-w-[800px] items-center"
                    onPointerLeave={() => setHoveredCardId(null)}
                >
                    {handCards.map((card, index) => {
                        const canAfford = playerUnit ? canAffordAbility(playerUnit, card.ability) : false;
                        const canUse = card.runtime.currentUses > 0;
                        const isDisabled = !isMyTurn || !canAfford || !canUse;
                        const isHovered = hoveredCardId === card.abilityId;
                        const activeAbilityIds = playerUnit?.activeAbilities.map((a) => a.abilityId) ?? [];
                        const activeHandIndex = handCards.findIndex((c) => activeAbilityIds.includes(c.abilityId));
                        const isActive = activeHandIndex >= 0 && index === activeHandIndex && !isMyTurn;

                        return (
                            <CardComponent
                                key={card.abilityId}
                                ability={card.ability}
                                runtime={card.runtime}
                                isSelected={selectedCardIndex === index}
                                isActive={isActive}
                                isDisabled={isDisabled}
                                onSelect={() => handleSelectCard(index)}
                                isHovered={isHovered}
                                onHoverChange={(hovered) => {
                                    if (hovered) {
                                        setHoveredCardId(card.abilityId);
                                    } else {
                                        setHoveredCardId((prev) => (prev === card.abilityId ? null : prev));
                                    }
                                }}
                                isMobile={isMobile}
                                showMobileDescription={mobileDescIndex === index}
                                onMobileDescriptionToggle={() => handleMobileDescToggle(index)}
                                onMobileDescriptionDismiss={handleMobileDescDismiss}
                                gameState={gameState}
                            />
                        );
                    })}

                    {handCards.length === 0 && (
                        <p className="text-muted text-sm py-4">No cards in hand</p>
                    )}
                </div>
            </div>

            {/* Mobile tooltip overlay */}
            {isMobile && mobileDescAbility && (
                <CardTooltip
                    title={mobileDescAbility.name}
                    lines={mobileDescAbility.getTooltipText(gameState)}
                    isMobileOverlay
                    onDismiss={handleMobileDescDismiss}
                />
            )}
        </div>
    );
}
