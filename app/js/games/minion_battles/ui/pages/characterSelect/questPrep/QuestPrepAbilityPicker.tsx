import React, { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../../abilities/Ability';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { getAttachedAbilityIds } from '../../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../../testing/testIds';
import { AbilitySlotPreview } from '../../../components/AbilitySlotPreview';
import AbilityTooltip from '../../../components/AbilityTooltip';

interface QuestPrepAbilityPickerProps {
    character: CampaignCharacter;
    selectableIds: readonly string[];
    selectedPrimaryIds: readonly string[];
    slotsFull: boolean;
    onAdd: (abilityId: string) => void;
}

/** Center pane: abilities the character can bring; click to fill an open Quest Prep slot. */
export function QuestPrepAbilityPicker({
    character,
    selectableIds,
    selectedPrimaryIds,
    slotsFull,
    onAdd,
}: QuestPrepAbilityPickerProps) {
    const abilities = useMemo(
        () => selectableIds.map((id) => getAbility(id)).filter((a): a is AbilityStatic => a != null),
        [selectableIds],
    );
    const [hoveredCard, setHoveredCard] = useState<{ ability: AbilityStatic; rect: DOMRect } | null>(null);
    const handleCardHover = useCallback((ability: AbilityStatic | null, rect: DOMRect | null) => {
        setHoveredCard(ability && rect ? { ability, rect } : null);
    }, []);

    return (
        <div
            data-testid={TestIds.questPrepAbilityPicker}
            className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-1"
        >
            <div className="min-h-0 flex-1 overflow-y-auto">
                {abilities.length === 0 ? (
                    <p className="text-muted text-sm italic text-center mt-6">No abilities available</p>
                ) : (
                    <div className="flex flex-wrap justify-center gap-3 content-start py-2">
                        {abilities.map((ability) => {
                            const already = selectedPrimaryIds.includes(ability.id);
                            const disabledTitle = already
                                ? 'Already selected'
                                : slotsFull
                                  ? 'All ability slots are full'
                                  : null;
                            const attached = getAttachedAbilityIds(ability.id);
                            return (
                                <div key={ability.id} className="flex flex-col items-center gap-1">
                                    <AbilitySlotPreview
                                        ability={ability}
                                        onHover={handleCardHover}
                                        onSelect={() => {
                                            if (!disabledTitle) onAdd(ability.id);
                                        }}
                                        disabled={disabledTitle != null}
                                        disabledTitle={disabledTitle}
                                        isSelected={already}
                                    />
                                    {attached.length > 0 && (
                                        <span className="text-[10px] text-amber-200/70 max-w-[100px] text-center leading-tight">
                                            +{attached.length} attached
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
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
        </div>
    );
}
