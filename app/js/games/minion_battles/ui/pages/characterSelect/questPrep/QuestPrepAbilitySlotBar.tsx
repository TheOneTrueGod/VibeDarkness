import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../../abilities/Ability';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import {
    getAttachedAbilityIds,
    QUEST_PREP_ABILITY_SLOT_COUNT,
} from '../../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../../testing/testIds';
import { AbilitySlotPreview } from '../../../components/AbilitySlotPreview';
import AbilityTooltip from '../../../components/AbilityTooltip';

interface QuestPrepAbilitySlotBarProps {
    character: CampaignCharacter;
    selectedPrimaryIds: readonly string[];
    slotCount?: number;
    onRemove: (abilityId: string) => void;
    /** When true, occupied slots cannot be cleared (mission under/at ability cap). */
    readOnly?: boolean;
}

/** Bottom row: 7 Quest Prep primary slots; click occupied to remove (+ attached leave with it). */
export function QuestPrepAbilitySlotBar({
    character,
    selectedPrimaryIds,
    slotCount = QUEST_PREP_ABILITY_SLOT_COUNT,
    onRemove,
    readOnly = false,
}: QuestPrepAbilitySlotBarProps) {
    const [hoveredCard, setHoveredCard] = useState<{ ability: AbilityStatic; rect: DOMRect } | null>(null);
    const handleCardHover = useCallback((ability: AbilityStatic | null, rect: DOMRect | null) => {
        setHoveredCard(ability && rect ? { ability, rect } : null);
    }, []);

    const slots = useMemo(() => {
        const out: Array<{ primary: AbilityStatic | null; attached: AbilityStatic[] }> = [];
        for (let i = 0; i < slotCount; i++) {
            const primaryId = selectedPrimaryIds[i];
            const primary = primaryId ? getAbility(primaryId) ?? null : null;
            const attached = primaryId
                ? getAttachedAbilityIds(primaryId)
                    .map((id) => getAbility(id))
                    .filter((a): a is AbilityStatic => a != null)
                : [];
            out.push({ primary, attached });
        }
        return out;
    }, [selectedPrimaryIds, slotCount]);

    return (
        <>
            <div
                data-testid={TestIds.questPrepAbilitySlotBar}
                className="flex h-full w-full min-h-0 items-center justify-center"
            >
                <div className="overflow-x-auto max-w-full">
                    <div className="flex gap-2 w-max mx-auto items-end">
                        {slots.map((slot, index) => (
                            <div
                                key={`quest-prep-slot-${index}`}
                                className="flex flex-col items-center gap-0.5 min-w-[72px]"
                            >
                                {slot.primary ? (
                                    <>
                                        <AbilitySlotPreview
                                            ability={slot.primary}
                                            onHover={handleCardHover}
                                            onSelect={
                                                readOnly
                                                    ? undefined
                                                    : () => onRemove(slot.primary!.id)
                                            }
                                        />
                                        {slot.attached.length > 0 && (
                                            <div className="flex gap-0.5 items-center">
                                                {slot.attached.map((a) => (
                                                    <AbilitySlotPreview
                                                        key={a.id}
                                                        ability={a}
                                                        onHover={handleCardHover}
                                                        compact
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div
                                        className="w-[72px] h-[96px] rounded-lg border border-dashed border-border-custom bg-surface/40 flex items-center justify-center"
                                        aria-label={`Empty ability slot ${index + 1}`}
                                    >
                                        <span className="text-[10px] text-muted">{index + 1}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {hoveredCard && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: hoveredCard.rect.top,
                        left: hoveredCard.rect.left + hoveredCard.rect.width / 2,
                        width: 0,
                        height: 0,
                        pointerEvents: 'none',
                        zIndex: 9999,
                    }}
                >
                    <AbilityTooltip
                        title={hoveredCard.ability.name}
                        lines={hoveredCard.ability.getTooltipText({
                            researchTrees: character.researchTrees,
                            researchNodeLevels: character.researchNodeLevels,
                        })}
                    />
                </div>,
                document.body,
            )}
        </>
    );
}
