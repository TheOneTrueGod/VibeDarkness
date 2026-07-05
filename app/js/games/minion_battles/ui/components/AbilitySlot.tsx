/**
 * AbilitySlot - Renders a single ability in the player's ability bar.
 *
 * Shows the ability's title and image. Hover shows description (desktop),
 * tap shows description overlay (mobile).
 */

import React, { useCallback } from 'react';
import { getAbilityResourceCosts, type AbilityModesConfig, type AbilityStatic } from '../../abilities/Ability';
import type { UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getAbilityUseConfig } from '../../abilities/abilityUses';
import { useAbilityUseChargeAnimation, type AbilityChargeAnimRule } from '../abilityUseChargeAnimation';
import { ChargeIcon } from './ChargeIcon';
import { RECOVERY_CHARGE_DEFINITIONS } from './recoveryChargeDefinitions';
import AbilityTooltip from './AbilityTooltip';
import { ResourceCostIcon } from './resources/ResourceCostIcon';
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
    const costs = getAbilityResourceCosts(ability);
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
                className={`
                    relative w-[124px] h-[158px] rounded-lg border-2 transition-all duration-150
                    flex flex-col items-stretch justify-between p-2 overflow-visible pointer-events-none
                    ${isSelected
                        ? 'border-yellow-400 bg-surface-light -translate-y-2 shadow-lg shadow-yellow-400/25'
                        : isHovered && !isDisabled
                            ? 'border-white bg-[#283a56] -translate-y-1'
                            : isActive
                                ? 'border-green-500 bg-surface-light shadow-lg shadow-green-500/25'
                                : isDisabled
                                    ? 'border-white/30 bg-surface-light'
                                    : 'border-white bg-surface-light'
                    }
                `}
            >
                {costs.length > 0 && (
                    <div className="absolute top-1 right-1 z-10 flex flex-col items-center gap-0.5 pointer-events-none">
                        {costs.map((cost) => (
                            <ResourceCostIcon
                                key={cost.resourceId}
                                resourceId={cost.resourceId}
                                amount={cost.amount}
                            />
                        ))}
                    </div>
                )}
                {showModeToggle && abilityModes && onCycleAbilityMode && (
                    <button
                        type="button"
                        className="absolute bottom-1 left-1 z-20 flex h-7 min-w-[2.75rem] items-center justify-center rounded border border-violet-400/70 bg-violet-950/90 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200 shadow-sm pointer-events-auto hover:border-violet-300 hover:bg-violet-900"
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
                    className={`flex min-h-0 flex-1 flex-col items-center justify-between ${isDisabled ? 'opacity-50' : ''}`}
                >
                    {/* Card image */}
                    <div
                        className="mb-1 mt-1 flex h-14 w-full items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: ability.image }}
                    />

                    {/* Card title */}
                    <span className="w-full whitespace-normal px-1 text-center text-[14px] font-medium leading-tight text-gray-100">
                        {ability.name}
                    </span>

                    <div className="mt-1 flex min-h-[22px] w-full items-center gap-1">
                        <div className="rounded border border-white bg-surface px-2.5 py-1 text-[11px] tabular-nums leading-none text-gray-100">
                            {usesLeft}/{maxUses}
                        </div>
                    {showRecovery && (
                        <div className="flex-1 flex flex-col justify-center gap-0.5">
                            {recoveryRules.map((rule, ruleIndex) => {
                                const recoveryNeeded = Math.max(1, rule.chargesPerRecovery);
                                const chargeDef = RECOVERY_CHARGE_DEFINITIONS[rule.chargeType];
                                const rowTitle = chargeDef.rowExplanation;
                                // Compute overlap: pips are 22px each; available width ~75px.
                                // Positive = gap (px), negative = overlap (px).
                                const PIP_SIZE = 22;
                                const AVAILABLE_WIDTH = 75;
                                const totalNatural = recoveryNeeded * PIP_SIZE + (recoveryNeeded - 1) * 2;
                                const interPipSpacing = totalNatural > AVAILABLE_WIDTH && recoveryNeeded > 1
                                    ? -Math.ceil((totalNatural - AVAILABLE_WIDTH) / (recoveryNeeded - 1))
                                    : 2;
                                return (
                                    <div
                                        key={`${rule.chargeType}-${rule.chargesPerRecovery}`}
                                        ref={ruleIndex === 0 ? onPrimaryRecoveryPillRef ?? null : null}
                                        className="flex min-h-[14px] items-center overflow-hidden py-px"
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
                                                    marginLeft={i === 0 ? 0 : interPipSpacing}
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
            </div>

            {/* Desktop hover tooltip */}
            {isHovered && !isMobile && (
                <AbilityTooltip
                    title={ability.name}
                    lines={tooltipLines}
                    disabledReason={disabledReason ?? undefined}
                />
            )}

            {/* Mobile description overlay is rendered by AbilityBar */}
        </div>
    );
}
