/**
 * AbilitySlot - Renders a single ability in the player's ability bar.
 *
 * Shows the ability's title and image. Hover shows description (desktop),
 * tap shows description overlay (mobile).
 */

/** Fixed card width in the ability bar (must match Tailwind `w-[108px]` below). */
export const ABILITY_SLOT_WIDTH_PX = 108;
/** Fixed card height in the ability bar (must match Tailwind `h-[126px]` below). */
export const ABILITY_SLOT_HEIGHT_PX = 126;
/** Horizontal gap between ability cards in the bar (`gap-2`). */
export const ABILITY_BAR_CARD_GAP_PX = 8;

import React, { useCallback, useRef } from 'react';
import { getAbilityResourceCosts, type AbilityModesConfig, type AbilityStatic } from '../../abilities/Ability';
import type { UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getAbilityUseConfig } from '../../abilities/abilityUses';
import { useAbilityUseChargeAnimation, type AbilityChargeAnimRule } from '../abilityUseChargeAnimation';
import { ChargeIcon } from './ChargeIcon';
import { RECOVERY_CHARGE_DEFINITIONS } from './recoveryChargeDefinitions';
import AbilityTooltip from './AbilityTooltip';
import {
    ResourceCostIcon,
    RESOURCE_COST_COMPACT_BADGE_MIN_HEIGHT_PX,
    STACKED_ICON_OVERLAP_PX,
} from './resources/ResourceCostIcon';
import type { DisabledReason } from './abilityDisabledReason';

interface AbilitySlotProps {
    ability: AbilityStatic;
    runtime: UnitAbilityRuntimeState;
    isSelected: boolean;
    /** Whether this card is currently being used (ability executing). */
    isActive?: boolean;
    disabledReason: DisabledReason | null;
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
    /** When set, show a per-cast mode toggle during ability selection/targeting. */
    abilityModes?: AbilityModesConfig;
    currentAbilityMode?: string;
    showModeToggle?: boolean;
    onCycleAbilityMode?: () => void;
}

export default function AbilitySlot({
    ability,
    runtime,
    isSelected,
    isActive = false,
    disabledReason,
    onSelect,
    isHovered,
    onHoverChange,
    isMobile,
    showMobileDescription,
    onMobileDescriptionToggle,
    onMobileDescriptionDismiss: _onMobileDescriptionDismiss,
    gameState,
    onPrimaryRecoveryPillRef,
    abilityModes,
    currentAbilityMode,
    showModeToggle = false,
    onCycleAbilityMode,
}: AbilitySlotProps) {
    const cardRef = useRef<HTMLDivElement | null>(null);
    const isDisabled = disabledReason !== null;

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
    // Display-only: getAbilityResourceCosts() also drives real affordability/spend/refund
    // logic (unit.getResource(...)), and HP isn't a generic Resource — append it here
    // purely for the card badge, never feed this array back into the economy pipeline.
    const costs = getAbilityResourceCosts(ability);
    const displayCosts = ability.hpCost
        ? [...costs, { resourceId: 'hp', amount: ability.hpCost }]
        : costs;
    const recoveryRules = getAbilityUseConfig(ability.id).recoveries;
    const hasRecovery = recoveryRules.length > 0;
    const firstRule = recoveryRules[0];
    const animRule: AbilityChargeAnimRule | undefined = firstRule
        ? {
              chargeType: firstRule.chargeType,
              chargesPerRecovery: firstRule.chargesPerRecovery,
              usesRecovered: firstRule.usesRecovered,
          }
        : undefined;
    const anim = useAbilityUseChargeAnimation(ability.id, runtime, hasRecovery ? animRule : undefined);
    const usesLeft = Math.max(0, anim.uses);
    const maxUses = Math.max(1, anim.maxUses);
    const isAtFullUses = usesLeft >= maxUses;
    const showRecovery = hasRecovery && !isAtFullUses;
    const modeLabel = currentAbilityMode === 'pull' ? 'Pull' : currentAbilityMode === 'push' ? 'Push' : currentAbilityMode;

    const handleModeToggle = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onCycleAbilityMode?.();
    }, [onCycleAbilityMode]);

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
                ref={cardRef}
                className={`
                    relative w-[108px] h-[126px] rounded-lg border-2 transition-all duration-150
                    flex flex-col items-stretch p-1 overflow-visible pointer-events-none
                    ${isSelected
                        ? ability.actionChannel === 'special'
                            ? 'border-cyan-400 bg-surface-light -translate-y-2 shadow-lg shadow-cyan-400/25'
                            : 'border-yellow-400 bg-surface-light -translate-y-2 shadow-lg shadow-yellow-400/25'
                        : isHovered && !isDisabled
                            ? 'border-white bg-[#283a56] -translate-y-1'
                            : isActive
                                ? 'border-green-500 bg-surface-light shadow-lg shadow-green-500/25'
                                : isDisabled
                                    ? 'border-white/30 bg-surface-light'
                                    : ability.actionChannel === 'special'
                                        ? 'border-cyan-700/80 bg-surface-light'
                                        : 'border-white bg-surface-light'
                    }
                `}
            >
                {/* Uses + recovery — inset from top-left corner */}
                <div
                    className={`absolute top-1 left-1 z-10 flex max-w-[calc(100%-32px)] items-center gap-0.5 pointer-events-none ${isDisabled ? 'opacity-50' : ''}`}
                >
                    <div
                        className="flex shrink-0 items-center rounded border border-white bg-surface px-1.5 py-0.5 text-[10px] tabular-nums leading-none text-gray-100"
                        style={{ minHeight: RESOURCE_COST_COMPACT_BADGE_MIN_HEIGHT_PX }}
                    >
                        {usesLeft}/{maxUses}
                    </div>
                    {showRecovery && (
                        <div className="flex min-w-0 flex-col justify-center gap-0.5">
                            {recoveryRules.map((rule, ruleIndex) => {
                                const recoveryNeeded = Math.max(1, rule.chargesPerRecovery);
                                const chargeDef = RECOVERY_CHARGE_DEFINITIONS[rule.chargeType];
                                const rowTitle = chargeDef.rowExplanation;
                                return (
                                    <div
                                        key={`${rule.chargeType}-${rule.chargesPerRecovery}`}
                                        ref={ruleIndex === 0 ? onPrimaryRecoveryPillRef ?? null : null}
                                        className="flex min-h-[14px] items-center py-px"
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
                                                    marginLeft={i === 0 ? 0 : -STACKED_ICON_OVERLAP_PX}
                                                    zIndex={recoveryNeeded - i}
                                                />
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Resource cost — inset from top-right corner */}
                {displayCosts.length > 0 && (
                    <div className="absolute top-1 right-1 z-10 flex flex-col items-end gap-0.5 pointer-events-none">
                        {displayCosts.map((cost) => (
                            <ResourceCostIcon
                                key={cost.resourceId}
                                resourceId={cost.resourceId}
                                amount={cost.amount}
                                alwaysCompact={cost.resourceId === 'hp'}
                            />
                        ))}
                    </div>
                )}

                {showModeToggle && abilityModes && onCycleAbilityMode && (
                    <button
                        type="button"
                        className="absolute top-1/2 left-1/2 z-30 flex h-6 min-w-[2.75rem] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded border border-violet-400/70 bg-violet-950/95 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 shadow-sm pointer-events-auto hover:border-violet-300 hover:bg-violet-900"
                        title={`Mode: ${modeLabel ?? currentAbilityMode} (click to cycle)`}
                        aria-label={`Ability mode ${modeLabel ?? currentAbilityMode}, click to cycle`}
                        onClick={handleModeToggle}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                handleModeToggle(e);
                            }
                        }}
                    >
                        {modeLabel ?? currentAbilityMode}
                    </button>
                )}

                <div
                    className={`flex min-h-0 flex-1 flex-col items-center justify-start px-0.5 pt-7 pb-1.5 ${isDisabled ? 'opacity-50' : ''}`}
                >
                    <span className="mb-3 line-clamp-2 w-full text-center text-[13px] font-medium leading-tight text-gray-100">
                        {ability.name}
                    </span>

                    <div
                        className="flex h-12 w-full shrink-0 items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: ability.image }}
                    />
                </div>
            </div>

            {/* Desktop hover tooltip (portaled above card) */}
            {!isMobile && (
                <AbilityTooltip
                    anchorRef={cardRef}
                    open={isHovered}
                    title={ability.name}
                    lines={tooltipLines}
                    disabledReason={disabledReason ?? undefined}
                />
            )}

            {/* Mobile description overlay is rendered by AbilityBar */}
        </div>
    );
}
