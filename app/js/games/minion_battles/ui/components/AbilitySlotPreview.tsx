import React, { useMemo, useState } from 'react';
import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityModifier } from '../../abilities/abilityModifierHelpers';
import { getAbilityUseConfig } from '../../abilities/abilityUses';
import type { UnitAbilityRuntimeState } from '../../game/units/Unit';
import { getAbility } from '../../abilities/AbilityRegistry';
import { resolveModeAbilityId } from '../../abilities/resolveAbilityMode';
import AbilitySlot, {
    ABILITY_MODE_STRIP_TOTAL_HEIGHT_PX,
    ABILITY_SLOT_PREP_HEIGHT_PX,
    usesHandModeStrip,
} from './AbilitySlot';

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
    // Display-only mode: previews the mode's card/tooltip (with research upgrades from tooltipContext);
    // never saved and never carried into battle, which always starts at `defaultMode`.
    const abilityModes = ability.abilityModes;
    const showModeStrip = usesHandModeStrip(abilityModes);
    const [previewMode, setPreviewMode] = useState<string | undefined>(abilityModes?.defaultMode);
    const shownAbility = getAbility(resolveModeAbilityId(ability, previewMode)) ?? ability;
    const useConfig = getAbilityUseConfig(shownAbility.id);
    const maxUses = Math.max(
        0,
        useConfig.maxUses + (getAbilityModifier(tooltipContext, undefined, shownAbility.id).maxUsesFlat ?? 0),
    );
    const runtime = useMemo((): UnitAbilityRuntimeState => ({
        currentUses: maxUses,
        maxUses,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    }), [maxUses]);

    const className = [
        compact ? 'scale-75 origin-center opacity-80' : '',
        disabled ? 'opacity-40' : '',
    ].filter(Boolean).join(' ') || undefined;

    return (
        <div
            data-className="AbilitySlotPreview"
            className={className}
            title={disabled && disabledTitle ? disabledTitle : undefined}
        >
            <AbilitySlot
                ability={shownAbility}
                runtime={runtime}
                isSelected={isSelected}
                // Prep cards keep their full body height; the mode strip adds height below.
                heightPx={ABILITY_SLOT_PREP_HEIGHT_PX + (showModeStrip ? ABILITY_MODE_STRIP_TOTAL_HEIGHT_PX : 0)}
                abilityModes={abilityModes}
                currentAbilityMode={previewMode}
                onSetAbilityMode={showModeStrip ? setPreviewMode : undefined}
                modeStripInteractive
                liftOnHover={false}
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
