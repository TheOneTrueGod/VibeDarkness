/**
 * CardComponent - Renders a single card in the player's hand.
 *
 * Shows the ability's title and image. Hover shows description (desktop),
 * tap shows description overlay (mobile).
 */

import React, { useState, useCallback } from 'react';
import type { AbilityStatic } from '../abilities/Ability';
import CardDescription from './CardDescription';

interface CardComponentProps {
    ability: AbilityStatic;
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
                    relative w-20 h-28 rounded-lg border-2 transition-all duration-150
                    flex flex-col items-center justify-between p-1.5 overflow-hidden
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
                    className="w-full h-14 flex items-center justify-center"
                    dangerouslySetInnerHTML={{ __html: ability.image }}
                />

                {/* Card title */}
                <span className="text-white text-[10px] font-medium leading-tight text-center w-full truncate">
                    {ability.name}
                </span>

                {/* Cooldown indicator */}
                <span className="text-muted text-[8px]">
                    {ability.cooldownTime}s
                </span>
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
