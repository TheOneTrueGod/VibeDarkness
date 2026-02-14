/**
 * CardHand - Renders the player's hand of cards at the bottom of the screen.
 *
 * Manages card selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { CardInstance } from '../engine/GameEngine';
import { getAbility } from '../abilities/AbilityRegistry';
import { canAffordAbility } from '../abilities/Ability';
import type { AbilityStatic } from '../abilities/Ability';
import type { Unit } from '../objects/Unit';
import CardComponent from './CardComponent';
import CardDescription from './CardDescription';
import CooldownIndicator from './CooldownIndicator';

interface CardHandProps {
    /** Cards in the player's hand. */
    cards: CardInstance[];
    /** The player's unit (for resource checks). */
    playerUnit: Unit | null;
    /** Whether it's this player's turn to act. */
    isMyTurn: boolean;
    /** Currently selected card index (in the hand), or null. */
    selectedCardIndex: number | null;
    /** Called when a card is selected. */
    onSelectCard: (handIndex: number, ability: AbilityStatic) => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
}

export default function CardHand({
    cards,
    playerUnit,
    isMyTurn,
    selectedCardIndex,
    onSelectCard,
    gameState,
}: CardHandProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);

    // Detect mobile via touch support
    useEffect(() => {
        setIsMobile('ontouchstart' in window || navigator.maxTouchPoints > 0);
    }, []);

    const handCards = useMemo(
        () => cards.filter((c) => c.location === 'hand'),
        [cards],
    );

    const handleSelectCard = useCallback(
        (handIndex: number) => {
            const card = handCards[handIndex];
            if (!card) return;
            const ability = getAbility(card.abilityId);
            if (!ability) return;
            onSelectCard(handIndex, ability);
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
        return getAbility(card.abilityId) ?? null;
    }, [mobileDescIndex, handCards]);

    return (
        <div className="relative bg-dark-900/80 border-t border-dark-700 px-4 py-2">
            {/* Cooldown indicator + card row */}
            <div className="flex items-center gap-3">
                {/* Cooldown indicator on far left */}
                {playerUnit && (
                    <CooldownIndicator unit={playerUnit} size={48} />
                )}

                {/* Cards */}
                <div className="flex gap-2 flex-1 justify-center">
                    {handCards.map((card, index) => {
                        const ability = getAbility(card.abilityId);
                        if (!ability) return null;

                        const canAfford = playerUnit ? canAffordAbility(playerUnit, ability) : false;
                        const isDisabled = !isMyTurn || !canAfford;

                        return (
                            <CardComponent
                                key={`${card.cardDefId}_${index}`}
                                ability={ability}
                                isSelected={selectedCardIndex === index}
                                isDisabled={isDisabled}
                                onSelect={() => handleSelectCard(index)}
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

            {/* Mobile description overlay */}
            {isMobile && mobileDescAbility && (
                <CardDescription
                    description={mobileDescAbility.getDescription(gameState)}
                    abilityName={mobileDescAbility.name}
                    isMobileOverlay
                    onDismiss={handleMobileDescDismiss}
                />
            )}
        </div>
    );
}
