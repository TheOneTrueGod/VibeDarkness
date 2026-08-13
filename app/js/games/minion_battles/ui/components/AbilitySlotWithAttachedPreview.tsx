import React from 'react';
import type { AbilityStatic } from '../../abilities/Ability';
import { ABILITY_SLOT_HEIGHT_PX, ABILITY_SLOT_WIDTH_PX } from './AbilitySlot';
import { AbilitySlotPreview } from './AbilitySlotPreview';

/** Scale for attached/base cards floating behind the primary. */
export const ATTACHED_PEEK_SCALE = 0.8;
/** Lift attached cards upward from the container bottom (px). */
const ATTACHED_PEEK_LIFT_PX = 52;
/** Extra lift per additional attached card (px). */
const ATTACHED_PEEK_STACK_STEP_PX = 8;

export interface AbilitySlotWithAttachedPreviewProps {
    primary: AbilityStatic;
    attached: readonly AbilityStatic[];
    tooltipContext?: unknown;
    onPrimarySelect?: () => void;
}

/**
 * Primary ability card with derived/attached companions stacked behind and slightly above,
 * peeking out without increasing the slot footprint (Prepare Carefully bottom row).
 */
export function AbilitySlotWithAttachedPreview({
    primary,
    attached,
    tooltipContext,
    onPrimarySelect,
}: AbilitySlotWithAttachedPreviewProps) {
    return (
        <div
            className="relative shrink-0 overflow-visible"
            style={{ width: ABILITY_SLOT_WIDTH_PX, height: ABILITY_SLOT_HEIGHT_PX }}
        >
            {attached.map((ability, index) => (
                <div
                    key={ability.id}
                    className="absolute bottom-0 left-1/2 z-0 origin-bottom pointer-events-none brightness-[0.92] saturate-90"
                    style={{
                        width: ABILITY_SLOT_WIDTH_PX,
                        transform: `translate(-50%, -${ATTACHED_PEEK_LIFT_PX + index * ATTACHED_PEEK_STACK_STEP_PX}px) scale(${ATTACHED_PEEK_SCALE})`,
                    }}
                >
                    <AbilitySlotPreview ability={ability} tooltipContext={tooltipContext} />
                </div>
            ))}
            <div className="relative z-10">
                <AbilitySlotPreview
                    ability={primary}
                    tooltipContext={tooltipContext}
                    onSelect={onPrimarySelect}
                />
            </div>
        </div>
    );
}
