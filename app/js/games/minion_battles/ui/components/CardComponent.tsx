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
import { useAbilityUseChargeAnimation, type AbilityChargeAnimRule } from '../abilityUseChargeAnimation';
import { ChargeIcon } from './ChargeIcon';
import { RECOVERY_CHARGE_DEFINITIONS } from './recoveryChargeDefinitions';
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
    /** Optional ref to the primary recovery pill row for external effects. */
    onPrimaryRecoveryPillRef?: (el: HTMLDivElement | null) => void;
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
    onPrimaryRecoveryPillRef,
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
    const costs = getAbilityResourceCosts(ability);
    const recoveryRules = getAbilityUseConfig(ability.id).recoveries;
    const showRecovery = recoveryRules.length > 0;
    const firstRule = recoveryRules[0];
    const animRule: AbilityChargeAnimRule | undefined = firstRule
        ? {
              chargeType: firstRule.chargeType,
              chargesPerRecovery: firstRule.chargesPerRecovery,
              usesRecovered: firstRule.usesRecovered,
          }
        : undefined;
    const anim = useAbilityUseChargeAnimation(ability.id, runtime, showRecovery ? animRule : undefined);
    const usesLeft = Math.max(0, anim.uses);
    const maxUses = Math.max(1, anim.maxUses);
    const isAtFullUses = usesLeft >= maxUses;

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
                    flex flex-col items-center justify-between p-2 overflow-visible pointer-events-none
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
                    className="w-full h-14 flex items-center justify-center mb-1 mt-1"
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
                            {recoveryRules.map((rule, ruleIndex) => {
                                const recoveryNeeded = Math.max(1, rule.chargesPerRecovery);
                                const chargeDef = RECOVERY_CHARGE_DEFINITIONS[rule.chargeType];
                                const rowTitle = chargeDef.rowExplanation;
                                return (
                                    <div
                                        key={`${rule.chargeType}-${rule.chargesPerRecovery}`}
                                        ref={ruleIndex === 0 ? onPrimaryRecoveryPillRef ?? null : null}
                                        className="flex min-h-[14px] items-center gap-0.5 overflow-visible py-px"
                                        title={rowTitle}
                                        aria-label={rowTitle}
                                    >
                                        {Array.from({ length: recoveryNeeded }, (_, i) => {
                                            const fillOpacity = isAtFullUses ? 'opacity-50' : 'opacity-100';
                                            let innerWidthPct = 0;
                                            let showFill = false;
                                            if (ruleIndex === 0) {
                                                const baseFull = isAtFullUses || i < anim.chargeFloor;
                                                if (anim.fillingSegmentIndex === i) {
                                                    showFill = true;
                                                    innerWidthPct = anim.fillProgress * 100;
                                                } else if (anim.drainingSegmentIndex === i) {
                                                    showFill = true;
                                                    innerWidthPct = anim.drainProgress * 100;
                                                } else if (baseFull) {
                                                    showFill = true;
                                                    innerWidthPct = 100;
                                                }
                                            } else {
                                                const rc = runtime.recoveryChargesByType[rule.chargeType] ?? 0;
                                                const isFilled = isAtFullUses || i < rc;
                                                if (isFilled) {
                                                    showFill = true;
                                                    innerWidthPct = 100;
                                                }
                                            }
                                            return (
                                                <ChargeIcon
                                                    key={i}
                                                    chargeType={rule.chargeType}
                                                    showFill={showFill}
                                                    fillOpacity={fillOpacity}
                                                    innerWidthPct={innerWidthPct}
                                                />
                                            );
                                        })}
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
