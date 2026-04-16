/**
 * CardComponent - Renders a single card in the player's hand.
 *
 * Shows the ability's title and image. Hover shows description (desktop),
 * tap shows description overlay (mobile).
 */

import React, { useCallback } from 'react';
import { getAbilityResourceCosts, type AbilityStatic } from '../../abilities/Ability';
import type { UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getAbilityUseConfig } from '../../abilities/abilityUses';
import CardTooltip from './CardTooltip';

interface CardComponentProps {
    ability: AbilityStatic;
    runtime: UnitAbilityRuntimeState;
    isSelected: boolean;
    /** Whether this card is currently being used (ability executing). */
    isActive?: boolean;
    isDisabled: boolean;
    onSelect: () => void;
    isHovered: boolean;
    onHoverChange: (hovered: boolean) => void;
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
    runtime,
    isSelected,
    isActive = false,
    isDisabled,
    onSelect,
    isHovered,
    onHoverChange,
    isMobile,
    showMobileDescription,
    onMobileDescriptionToggle,
    onMobileDescriptionDismiss: _onMobileDescriptionDismiss,
    gameState,
}: CardComponentProps) {
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
    const usesLeft = Math.max(0, runtime.currentUses);
    const maxUses = Math.max(1, runtime.maxUses);
    const costs = getAbilityResourceCosts(ability);
    const recoveryRules = getAbilityUseConfig(ability.id).recoveries;
    const showRecovery = recoveryRules.length > 0 && usesLeft < maxUses;
    const recoveryColorByType: Record<string, string> = {
        staminaCharge: 'bg-gray-300',
        lightCharge: 'bg-yellow-300',
        energyCharge: 'bg-cyan-300',
    };

    return (
        <div
            className={`relative ${isDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            role="button"
            tabIndex={0}
            onClick={handleClick}
            onPointerEnter={() => onHoverChange(true)}
            onPointerLeave={() => onHoverChange(false)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
            aria-disabled={isDisabled}
        >
            <div
                className={`
                    relative w-[124px] h-[158px] rounded-lg border-2 transition-all duration-150
                    flex flex-col items-center justify-between p-2 overflow-hidden pointer-events-none
                    ${isSelected
                        ? 'border-yellow-400 bg-dark-700 -translate-y-2 shadow-lg shadow-yellow-400/20'
                        : isHovered
                            ? 'border-dark-400 bg-dark-700 -translate-y-1'
                            : isActive
                                ? 'border-green-500 bg-dark-700 shadow-lg shadow-green-500/30'
                                : isDisabled
                                    ? 'border-dark-600 bg-dark-800 opacity-50'
                                    : 'border-dark-500 bg-dark-700'
                    }
                `}
            >
                {/* Card image */}
                <div
                    className="w-full h-14 flex items-center justify-center mb-1"
                    dangerouslySetInnerHTML={{ __html: ability.image }}
                />

                {/* Card title */}
                <span className="text-white text-[14px] font-medium leading-tight text-center w-full px-1 whitespace-normal">
                    {ability.name}
                </span>

                {costs.length > 0 && (
                    <div className="w-full flex flex-wrap items-center justify-center gap-1 mt-1">
                        {costs.map((cost) => (
                            <div
                                key={`${cost.resourceId}-${cost.amount}`}
                                className="px-1.5 py-0.5 rounded border border-dark-500 text-[10px] text-gray-200 bg-dark-800"
                            >
                                {cost.resourceId} -{cost.amount}
                            </div>
                        ))}
                    </div>
                )}

                <div className="w-full mt-1 flex items-center gap-1 min-h-[22px]">
                    <div className="px-2.5 py-1 rounded border border-gray-500 bg-gray-700 text-[11px] text-gray-100 tabular-nums leading-none">
                        {usesLeft}/{maxUses}
                    </div>
                    {showRecovery && (
                        <div className="flex-1 flex flex-col justify-center gap-0.5">
                            {recoveryRules.map((rule) => {
                                const recoveryCurrent = runtime.recoveryChargesByType[rule.chargeType] ?? 0;
                                const recoveryNeeded = Math.max(1, rule.chargesPerRecovery);
                                const fillClass = recoveryColorByType[rule.chargeType] ?? 'bg-gray-300';
                                return (
                                    <div key={`${rule.chargeType}-${rule.chargesPerRecovery}`} className="flex items-center gap-0.5 h-2.5">
                                        {Array.from({ length: recoveryNeeded }, (_, i) => (
                                            <div key={i} className="flex-1 max-w-[40px] h-2 rounded-[2px] border border-gray-600 bg-gray-800">
                                                <div className={`h-full rounded-[1px] ${i < recoveryCurrent ? fillClass : 'bg-transparent'}`} />
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
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
