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
import { getCardDef } from '../card_defs';
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
    /** Called when the player clicks the Wait button. */
    onWait?: () => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
    /** Current game time (seconds) for discard timing. */
    gameTime?: number;
}

export default function CardHand({
    cards,
    playerUnit,
    isMyTurn,
    selectedCardIndex,
    onSelectCard,
    onWait,
    gameState,
    gameTime,
}: CardHandProps) {
    const [mobileDescIndex, setMobileDescIndex] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [hoveredPile, setHoveredPile] = useState<'deck' | 'discard' | null>(null);

    const deckCards = useMemo(
        () => cards.filter((c) => c.location === 'deck'),
        [cards],
    );

    const discardCards = useMemo(
        () => cards.filter((c) => c.location === 'discard'),
        [cards],
    );

    const deckCount = deckCards.length;
    const discardCount = discardCards.length;

    const formatCount = useCallback((value: number) => {
        const clamped = Math.min(99, Math.max(0, value));
        return clamped.toString().padStart(2, '0');
    }, []);

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

    const getDiscardLabel = useCallback(
        (card: CardInstance): string => {
            const def = getCardDef(card.cardDefId);
            const ability = getAbility(card.abilityId);
            const name = def?.name ?? ability?.name ?? String(card.cardDefId);

            const dd = def?.discardDuration;
            if (!dd) {
                return name;
            }
            
            if (dd.unit === 'rounds') {
                const remainingRounds = card.discardRoundsRemaining ?? dd.duration;
                return `${name} (${remainingRounds}r)`;
            }

            // Seconds-based: show remaining in-game seconds until re-added to deck (e.g. "0.4s")
            const addedAt = card.discardAddedAtTime;
            if (typeof gameTime === 'number' && typeof addedAt === 'number') {
                const elapsed = Math.max(0, gameTime - addedAt);
                const remaining = Math.max(0, dd.duration - elapsed);
                const secStr = remaining % 1 === 0 ? `${remaining}s` : `${remaining.toFixed(1)}s`;
                return `${name} (${secStr})`;
            }

            return `${name} (${dd.duration}s)`;
        },
        [gameTime],
    );

    return (
        <div className="relative bg-dark-900/80 border-t border-dark-700 px-4 py-2">
            {/* Cooldown indicator + card row */}
            <div className="flex items-center gap-4">
                {/* Deck / discard indicators + cooldown indicator + Wait button on far left */}
                {playerUnit && (
                    <>
                        <div className="flex flex-col gap-2 mr-2">
                            <div
                                className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 bg-black border border-white text-white text-xs leading-none"
                                onMouseEnter={() => setHoveredPile('deck')}
                                onMouseLeave={() => setHoveredPile((prev) => (prev === 'deck' ? null : prev))}
                            >
                                <span className="text-sm">⮞</span>
                                <span className="font-mono tracking-[0.25em] tabular-nums text-sm">
                                    {formatCount(deckCount)}
                                </span>
                                {hoveredPile === 'deck' && (
                                    <div className="absolute left-full ml-3 top-1/2 -translate-y-full z-20 w-64 rounded-md border border-dark-600 bg-black px-3 py-2 text-xs shadow-lg">
                                        <div className="font-semibold text-sm mb-1">Deck</div>
                                        <p className="text-[11px] text-gray-200">
                                            When you draw a card, you get a random card from the deck.
                                        </p>
                                        <div className="mt-2">
                                            <div className="font-semibold text-[11px] mb-1">Cards in deck</div>
                                            {deckCards.length === 0 ? (
                                                <p className="text-[11px] text-gray-400">No cards in deck.</p>
                                            ) : (
                                                <ul className="space-y-0.5 text-[11px] text-gray-100">
                                                    {deckCards.map((card, idx) => {
                                                        const def = getCardDef(card.cardDefId);
                                                        const ability = getAbility(card.abilityId);
                                                        const name = def?.name ?? ability?.name ?? String(card.cardDefId);
                                                        return (
                                                            <li key={`${card.cardDefId}_${idx}`}>• {name}</li>
                                                        );
                                                    })}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div
                                className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 bg-black border border-white text-white text-xs leading-none"
                                onMouseEnter={() => setHoveredPile('discard')}
                                onMouseLeave={() => setHoveredPile((prev) => (prev === 'discard' ? null : prev))}
                            >
                                <span className="text-sm">↻</span>
                                <span className="font-mono tracking-[0.25em] tabular-nums text-sm">
                                    {formatCount(discardCount)}
                                </span>
                                {hoveredPile === 'discard' && (
                                    <div className="absolute left-full ml-3 top-1/2 -translate-y-full z-20 w-72 rounded-md border border-dark-600 bg-black px-3 py-2 text-xs shadow-lg">
                                        <div className="font-semibold text-sm mb-1">Discard</div>
                                        <p className="text-[11px] text-gray-200">
                                            Cards move from the discard pile back into the deck when they finish recovering.
                                        </p>
                                        <div className="mt-2">
                                            <div className="font-semibold text-[11px] mb-1">Cards in discard</div>
                                            {discardCards.length === 0 ? (
                                                <p className="text-[11px] text-gray-400">No cards in discard.</p>
                                            ) : (
                                                <ul className="space-y-0.5 text-[11px] text-gray-100">
                                                    {discardCards.map((card, idx) => (
                                                        <li key={`${card.cardDefId}_${idx}`}>• {getDiscardLabel(card)}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                            <div className="flex items-center gap-2">
                                <CooldownIndicator
                                    unit={playerUnit}
                                    size={48}
                                    gameTime={gameTime ?? 0}
                                />
                                {(() => {
                                    const active = playerUnit.activeAbilities[0];
                                    const activeCard = active
                                        ? handCards.find((c) => c.abilityId === active.abilityId)
                                        : null;
                                    const activeAbility = activeCard ? getAbility(activeCard.abilityId) : null;
                                    if (!activeCard || !activeAbility) return null;
                                    return (
                                        <div className="opacity-80 flex-shrink-0">
                                            <CardComponent
                                                ability={activeAbility}
                                                card={activeCard}
                                                isSelected={false}
                                                isDisabled
                                                onSelect={() => {}}
                                                isMobile={false}
                                                showMobileDescription={false}
                                                onMobileDescriptionToggle={() => {}}
                                                onMobileDescriptionDismiss={() => {}}
                                                gameState={gameState}
                                            />
                                        </div>
                                    );
                                })()}
                            </div>
                            <button
                                onClick={onWait}
                                disabled={!isMyTurn}
                                className={`text-xs px-3 py-1 rounded border transition-colors ${
                                    isMyTurn
                                        ? 'bg-dark-700 border-dark-500 text-gray-200 hover:bg-dark-600 hover:border-gray-400'
                                        : 'bg-dark-800 border-dark-700 text-gray-600 cursor-not-allowed'
                                }`}
                                title="Wait (Space)"
                            >
                                Wait
                            </button>
                        </div>
                    </>
                )}

                {/* Cards: max width 800px so bar doesn't grow too wide */}
                <div className="flex gap-2 flex-1 justify-center min-w-0 max-w-[800px]">
                    {handCards.map((card, index) => {
                        const ability = getAbility(card.abilityId);
                        if (!ability) return null;

                        const canAfford = playerUnit ? canAffordAbility(playerUnit, ability) : false;
                        const isDisabled = !isMyTurn || !canAfford;

                        return (
                            <CardComponent
                                key={`${card.cardDefId}_${index}`}
                                ability={ability}
                                card={card}
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
