import React, { useMemo, useState } from 'react';
import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityUseConfig } from '../../abilities/abilityUses';
import type { UnitAbilityRuntimeState } from '../../game/units/Unit';
import AbilitySlot from './AbilitySlot';

export interface AbilitySlotPreviewProps {
    ability: AbilityStatic;
    /**
     * Passed to `ability.getTooltipText` (e.g. research trees / node levels on character select).
     * Tooltips render via AbilitySlot → AbilityTooltip → AnchoredPortalTooltip (auto-flip).
     */
    tooltipContext?: unknown;
    /** When set, clicking the slot invokes this (Quest Prep / interactive previews). */
    onSelect?: () => void;
    /** When true, clicks are ignored and the card is dimmed. */
    disabled?: boolean;
    /** Optional title for disabled state (native tooltip). */
    disabledTitle?: string | null;
    isSelected?: boolean;
    /** Dim / non-interactive companion badge under a primary. */
    compact?: boolean;
}

/**
 * Read-only or lightly interactive ability card for character-select / Quest Prep.
 * Reuses AbilitySlot chrome with a fake full-uses runtime and shared portaled tooltips.
 */
export function AbilitySlotPreview({
    ability,
    tooltipContext,
    onSelect,
    disabled = false,
    disabledTitle = null,
    isSelected = false,
    compact = false,
}: AbilitySlotPreviewProps) {
    const [hovered, setHovered] = useState(false);
    const useConfig = getAbilityUseConfig(ability.id);
    const runtime = useMemo((): UnitAbilityRuntimeState => ({
        currentUses: useConfig.maxUses,
        maxUses: useConfig.maxUses,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    }), [useConfig.maxUses]);

    const className = [
        compact ? 'scale-75 origin-center opacity-80' : '',
        disabled ? 'opacity-40' : '',
    ].filter(Boolean).join(' ') || undefined;

    return (
        <div
            className={className}
            title={disabled && disabledTitle ? disabledTitle : undefined}
        >
            <AbilitySlot
                ability={ability}
                runtime={runtime}
                isSelected={isSelected}
                disabledReason={null}
                onSelect={disabled ? () => {} : (onSelect ?? (() => {}))}
                isHovered={hovered}
                onHoverChange={setHovered}
                isMobile={false}
                showMobileDescription={false}
                onMobileDescriptionToggle={() => {}}
                onMobileDescriptionDismiss={() => {}}
                gameState={tooltipContext}
            />
        </div>
    );
}
