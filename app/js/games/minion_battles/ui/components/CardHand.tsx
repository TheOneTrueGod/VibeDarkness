/**
 * CardHand - Renders the player's hand of cards at the bottom of the screen.
 *
 * Manages card selection, mobile description overlays, and disabled state
 * based on whose turn it is and resource availability.
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import type { CardInstance } from '../../game/GameEngine';
import { getAbility } from '../../abilities/AbilityRegistry';
import { canAffordAbility } from '../../abilities/Ability';
import type { AbilityStatic } from '../../abilities/Ability';
import type { Unit } from '../../game/units/Unit';
import { getCardDef } from '../../card_defs';
import CardComponent from './CardComponent';
import CardTooltip from './CardTooltip';

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
    const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

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

    useEffect(() => {
        if (hoveredCardId && !handCards.some((card) => card.instanceId === hoveredCardId)) {
            setHoveredCardId(null);
        }
    }, [handCards, hoveredCardId]);

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
            if (dd.unit === 'never') {
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
            {/* Fixed-height row for deck, discard, Wait, and hand */}
            <div className="flex items-center gap-4 h-[152px]">
                {/* Deck / discard indicators + cooldown + Wait + hand */}
                {playerUnit && (
                    <>
                        <div className="flex flex-col gap-2 mr-2 flex-shrink-0">
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
                        const ability = getAbility(card.abilityId);
                        if (!ability) return null;

                        const canAfford = playerUnit ? canAffordAbility(playerUnit, ability) : false;
                        const isDisabled = !isMyTurn || !canAfford;
                        const isHovered = hoveredCardId === card.instanceId;
                        const activeAbilityIds = playerUnit?.activeAbilities.map((a) => a.abilityId) ?? [];
                        const activeHandIndex = handCards.findIndex((c) => activeAbilityIds.includes(c.abilityId));
                        const isActive = activeHandIndex >= 0 && index === activeHandIndex && !isMyTurn;

                        return (
                            <CardComponent
                                key={card.instanceId}
                                ability={ability}
                                card={card}
                                isSelected={selectedCardIndex === index}
                                isActive={isActive}
                                isDisabled={isDisabled}
                                onSelect={() => handleSelectCard(index)}
                                isHovered={isHovered}
                                onHoverChange={(hovered) => {
                                    if (hovered) {
                                        setHoveredCardId(card.instanceId);
                                    } else {
                                        setHoveredCardId((prev) => (prev === card.instanceId ? null : prev));
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
