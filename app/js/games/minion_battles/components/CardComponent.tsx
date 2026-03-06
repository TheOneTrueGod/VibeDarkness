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
import CardDescription from './CardDescription';

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

    const description = ability.getDescription(gameState);

    return (
        <div className="relative">
            <button
                onClick={handleClick}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                disabled={isDisabled}
                className={`
                    relative w-[104px] h-[136px] rounded-lg border-2 transition-all duration-150
                    flex flex-col items-center justify-between p-2 overflow-hidden
                    ${isSelected
                        ? 'border-yellow-400 bg-dark-700 -translate-y-2 shadow-lg shadow-yellow-400/20'
                        : isDisabled
                            ? 'border-dark-600 bg-dark-800 opacity-50 cursor-not-allowed'
                            : 'border-dark-500 bg-dark-700 hover:border-dark-400 hover:-translate-y-1 cursor-pointer'
                    }
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

                {/* Cooldown + durability bar row */}
                <div className="w-full flex items-center gap-1">
                    <span className="text-muted text-[12px] shrink-0">
                        {ability.cooldownTime}s
                    </span>
                    <div
                        className="h-2 flex-1 min-w-0 max-w-[70%] rounded-sm bg-dark-800 overflow-hidden border border-gray-600"
                        title={`Durability: ${card.durability}/${getCardDef(card.cardDefId)?.durability ?? 1}`}
                    >
                        <div
                            className="h-full bg-gray-500 transition-all rounded-[2px]"
                            style={{
                                width: `${Math.max(0, Math.min(100, (card.durability / ((getCardDef(card.cardDefId)?.durability ?? 1) || 1)) * 100))}%`,
                            }}
                        />
                    </div>
                </div>
            </button>

            {/* Desktop hover description */}
            {isHovered && !isMobile && (
                <CardDescription
                    description={description}
                    abilityName={ability.name}
                />
            )}

            {/* Mobile description overlay is rendered by CardHand */}
        </div>
    );
}
