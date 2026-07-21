import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getItemDef } from '../../../character_defs/items';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import { getAbilityUseConfig } from '../../../abilities/abilityUses';
import {
    mergeBattleEquipmentIdsFromResearch,
    getDirectCardsFromResearch,
    getRemovedCardsFromResearch,
    getCardReplacementsFromResearch,
} from '../../../../../researchTrees/evaluator';
import type { UnitAbilityRuntimeState } from '../../../game/units/Unit';
import AbilitySlot from '../../components/AbilitySlot';
import AbilityTooltip from '../../components/AbilityTooltip';

function AbilitySlotPreview({
    ability,
    onHover,
}: {
    ability: AbilityStatic;
    onHover: (ability: AbilityStatic | null, rect: DOMRect | null) => void;
}) {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const useConfig = getAbilityUseConfig(ability.id);
    const runtime = useMemo((): UnitAbilityRuntimeState => ({
        currentUses: useConfig.maxUses,
        maxUses: useConfig.maxUses,
        recoveryChargesByType: {},
        active: true,
        replacedAbilityId: null,
    }), [useConfig.maxUses]);
    return (
        <div
            ref={wrapperRef}
            onPointerEnter={() => onHover(ability, wrapperRef.current?.getBoundingClientRect() ?? null)}
            onPointerLeave={() => onHover(null, null)}
        >
            <AbilitySlot
                ability={ability}
                runtime={runtime}
                isSelected={false}
                disabledReason={null}
                onSelect={() => {}}
                isHovered={false}
                onHoverChange={() => {}}
                isMobile={false}
                showMobileDescription={false}
                onMobileDescriptionToggle={() => {}}
                onMobileDescriptionDismiss={() => {}}
            />
        </div>
    );
}

function useCharacterAbilityCards(character: CampaignCharacter): AbilityStatic[] {
    return useMemo((): AbilityStatic[] => {
        const merged = mergeBattleEquipmentIdsFromResearch(character.equipment, character.researchTrees);
        const equippedIds = [...merged.equipmentIds, ...merged.extraEquippedItemIds];
        const abilities: string[] = [];
        for (const itemId of equippedIds) {
            const item = getItemDef(itemId);
            if (!item) continue;
            for (const cardId of item.cardsToAdd) {
                if (!abilities.includes(cardId)) abilities.push(cardId);
            }
        }
        for (const cardId of getDirectCardsFromResearch(character.researchTrees)) {
            if (!abilities.includes(cardId)) abilities.push(cardId);
        }
        const removedCardIds = getRemovedCardsFromResearch(character.researchTrees);
        if (removedCardIds.size > 0) {
            for (let i = abilities.length - 1; i >= 0; i--) {
                if (removedCardIds.has(abilities[i]!)) abilities.splice(i, 1);
            }
        }
        const replacements = getCardReplacementsFromResearch(character.researchTrees);
        if (replacements.size > 0) {
            for (let i = 0; i < abilities.length; i++) {
                const r = replacements.get(abilities[i]!);
                if (r) abilities[i] = r;
            }
        }
        return abilities.map((id) => getAbility(id)).filter((a): a is AbilityStatic => a != null);
    }, [character.equipment, character.researchTrees]);
}

interface CharacterSelectBottomAbilityListProps {
    character: CampaignCharacter;
}

/** Bottom strip of loadout ability cards for the overview (main) character-select view. */
export function CharacterSelectBottomAbilityList({ character }: CharacterSelectBottomAbilityListProps) {
    const abilityCards = useCharacterAbilityCards(character);
    const [hoveredCard, setHoveredCard] = useState<{ ability: AbilityStatic; rect: DOMRect } | null>(null);
    const handleCardHover = useCallback((ability: AbilityStatic | null, rect: DOMRect | null) => {
        setHoveredCard(ability && rect ? { ability, rect } : null);
    }, []);

    return (
        <>
            <div className="flex h-full w-full min-h-0 items-center justify-center">
                {abilityCards.length === 0 ? (
                    <p className="text-muted text-sm italic">No ability cards</p>
                ) : (
                    <div className="overflow-x-auto max-w-full">
                        <div className="flex gap-3 w-max mx-auto items-center">
                            {abilityCards.map((ability) => (
                                <AbilitySlotPreview key={ability.id} ability={ability} onHover={handleCardHover} />
                            ))}
                        </div>
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
        </>
    );
}
