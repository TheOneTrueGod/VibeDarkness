/**
 * CardComponent - Renders a single card in the player's hand.
 *
 * Shows the ability's title and image. Hover shows description (desktop),
 * tap shows description overlay (mobile).
 */

import React, { useState, useCallback } from 'react';
import type { AbilityStatic } from '../abilities/Ability';
import type { CardInstance } from '../engine/GameEngine';
import { getCardDef } from '../card_defs';
import CardTooltip from './CardTooltip';

interface CardComponentProps {
    ability: AbilityStatic;
    /** Card instance for durability display. */
    card: CardInstance;
    isSelected: boolean;
    isDisabled: boolean;
    onSelect: () => void;
    /** If true, use mobile touch behavior. */
    isMobile: boolean;
    /** For mobile: currently showing description overlay. */
    showMobileDescription: boolean;
    onMobileDescriptionToggle: () => void;
    onMobileDescriptionDismiss: () => void;
    /** Current game state for dynamic descriptions. */
    gameState?: unknown;
}

export default function CardComponent({
    ability,
    card,
    isSelected,
    isDisabled,
    onSelect,
    isMobile,
    showMobileDescription,
    onMobileDescriptionToggle,
    onMobileDescriptionDismiss,
    gameState,
}: CardComponentProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleClick = useCallback(() => {
        if (isDisabled) return;
        if (isMobile && !showMobileDescription) {
            // First tap on mobile: show description
            onMobileDescriptionToggle();
            return;
        }
        // Desktop click or second mobile tap: select card
        onSelect();
    }, [isDisabled, isMobile, showMobileDescription, onSelect, onMobileDescriptionToggle]);

    const tooltipLines = ability.getTooltipText(gameState);
    const def = getCardDef(card.cardDefId);
    const maxDurability = Math.max(1, def?.durability ?? 1);
    const usesLeft = Math.max(0, Math.min(card.durability, maxDurability));

    return (
        <div className="relative">
            <div
                role="button"
                tabIndex={0}
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleClick();
                    }
                }}
                aria-disabled={isDisabled}
                className={`
                    relative w-[104px] h-[136px] rounded-lg border-2 transition-all duration-150
                    flex flex-col items-center justify-between p-2 overflow-hidden
                    ${isSelected
                        ? 'border-yellow-400 bg-dark-700 -translate-y-2 shadow-lg shadow-yellow-400/20'
                        : isDisabled
                            ? 'border-dark-600 bg-dark-800 opacity-50 cursor-not-allowed'
                            : 'border-dark-500 bg-dark-700 hover:border-dark-400 hover:-translate-y-1 cursor-pointer'
                    }
                    hover:border-dark-400 hover:-translate-y-1
                `}
            >
                {/* Card image */}
                <div
                    className="w-full h-16 flex items-center justify-center mb-1"
                    dangerouslySetInnerHTML={{ __html: ability.image }}
                />

                {/* Card title */}
                <span className="text-white text-[14px] font-medium leading-tight text-center w-full px-1 whitespace-normal">
                    {ability.name}
                </span>

                {/* Uses number (circle) + segmented bar */}
                <div className="w-full flex items-center gap-1">
                    {/* Black circle + number (left of bar) */}
                    <div className="relative flex shrink-0 items-center justify-center w-5 h-5">
                        <div
                            className="absolute inset-0 rounded-full bg-black border border-gray-600 z-0"
                            aria-hidden
                        />
                        <span
                            className="relative z-20 text-[11px] font-mono font-semibold text-white tabular-nums"
                            aria-label={`${usesLeft} uses left`}
                        >
                            {usesLeft}
                        </span>
                    </div>
                    {/* Segmented bar: one segment per use, filled = remaining */}
                    <div className="flex-1 min-w-0 flex gap-0.5 h-2 relative z-10">
                        {Array.from({ length: maxDurability }, (_, i) => (
                            <div
                                key={i}
                                className="flex-1 min-w-0 rounded-[2px] border border-gray-600 overflow-hidden bg-dark-800"
                                title={`Uses: ${usesLeft}/${maxDurability}`}
                            >
                                <div
                                    className={`h-full transition-all rounded-[1px] ${
                                        i < usesLeft ? 'bg-gray-500' : 'bg-transparent'
                                    }`}
                                    style={{ width: '100%' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Desktop hover tooltip */}
            {isHovered && !isMobile && (
                <CardTooltip
                    title={ability.name}
                    lines={tooltipLines}
                />
            )}

            {/* Mobile description overlay is rendered by CardHand */}
        </div>
    );
}
