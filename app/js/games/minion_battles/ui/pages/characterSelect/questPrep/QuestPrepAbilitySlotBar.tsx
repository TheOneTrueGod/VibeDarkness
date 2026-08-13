import React, { useMemo } from 'react';
import { getAbility } from '../../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../../abilities/Ability';
import type { CampaignCharacter } from '../../../../character_defs/CampaignCharacter';
import { QUEST_PREP_ABILITY_SLOT_COUNT } from '../../../../storylines/questPrepLoadout';
import { TestIds } from '../../../../../../testing/testIds';
import { ABILITY_SLOT_HEIGHT_PX, ABILITY_SLOT_WIDTH_PX } from '../../../components/AbilitySlot';
import { AbilitySlotPreview } from '../../../components/AbilitySlotPreview';

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
    const tooltipContext = useMemo(
        () => ({
            researchTrees: character.researchTrees,
            researchNodeLevels: character.researchNodeLevels,
        }),
        [character.researchTrees, character.researchNodeLevels],
    );

    const slots = useMemo((): Array<AbilityStatic | null> => {
        const out: Array<AbilityStatic | null> = [];
        for (let i = 0; i < slotCount; i++) {
            const primaryId = selectedPrimaryIds[i];
            out.push(primaryId ? getAbility(primaryId) ?? null : null);
        }
        return out;
    }, [selectedPrimaryIds, slotCount]);

    return (
        <div
            data-testid={TestIds.questPrepAbilitySlotBar}
            className="flex w-full min-h-0 items-center justify-center"
        >
            <div className="max-w-full overflow-x-auto overflow-y-hidden">
                <div className="mx-auto flex w-max items-center gap-2">
                    {slots.map((ability, index) => (
                        <div key={`quest-prep-slot-${index}`} className="shrink-0">
                            {ability ? (
                                <AbilitySlotPreview
                                    ability={ability}
                                    tooltipContext={tooltipContext}
                                    onSelect={
                                        readOnly
                                            ? undefined
                                            : () => onRemove(ability.id)
                                    }
                                />
                            ) : (
                                <div
                                    className="rounded-lg border border-dashed border-border-custom bg-surface/40 flex items-center justify-center shrink-0"
                                    style={{
                                        width: ABILITY_SLOT_WIDTH_PX,
                                        height: ABILITY_SLOT_HEIGHT_PX,
                                    }}
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
    );
}
