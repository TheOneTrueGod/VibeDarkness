import React, { useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';
import { getItemDef } from '../../../character_defs/items';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import { getAbilityUseConfig } from '../../../abilities/abilityUses';
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

export function CharacterOverview({
    character,
    onChangeCharacter,
}: {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
}) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || (portrait?.name ?? 'Character');

    const abilityCards = useMemo((): AbilityStatic[] => {
        const cardIds: string[] = [];
        const seen = new Set<string>();
        for (const itemId of character.equipment) {
            const item = getItemDef(itemId);
            if (!item) continue;
            for (const cardId of item.cardsToAdd) {
                if (!seen.has(cardId)) {
                    seen.add(cardId);
                    cardIds.push(cardId);
                }
            }
        }
        return cardIds.map((id) => getAbility(id)).filter((a): a is AbilityStatic => a != null);
    }, [character.equipment]);

    const [hoveredCard, setHoveredCard] = useState<{ ability: AbilityStatic; rect: DOMRect } | null>(null);
    const handleCardHover = useCallback((ability: AbilityStatic | null, rect: DOMRect | null) => {
        setHoveredCard(ability && rect ? { ability, rect } : null);
    }, []);

    return (
        <>
        <div className="flex-1 min-h-0 flex px-5 pb-5 pt-4 gap-0 items-start">
            <div className="flex flex-col items-center gap-3 shrink-0 w-[220px]">
                <div className="w-[220px] h-[220px] rounded-lg overflow-hidden bg-background border-2 border-green-500 shadow-[0_0_16px_rgba(34,197,94,0.35)] flex flex-col">
                    <div className="flex-1 overflow-hidden flex items-center justify-center relative">
                        {portrait?.picture
                            ? <img src={portrait.picture} alt={displayName} className="w-full h-full object-cover" />
                            : <span className="text-gray-500 text-sm">No portrait</span>
                        }
                    </div>
                    <div className="px-3 py-2 bg-surface-light text-center">
                        <span className="text-sm font-semibold text-white">{displayName}</span>
                    </div>
                </div>
                <button
                    type="button"
                    className="w-full px-4 py-2 rounded-lg border border-border-custom bg-surface text-sm font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                    onClick={onChangeCharacter}
                >
                    Change character
                </button>
            </div>

            <div className="w-px bg-border-custom mx-5 shrink-0" style={{ height: 220 }} />

            <div className="flex-1 min-w-0 flex items-center" style={{ height: 220 }}>
                {abilityCards.length === 0 ? (
                    <p className="text-muted text-sm italic">No ability cards</p>
                ) : (
                    <div className="overflow-x-auto pb-2 w-full">
                        <div className="flex gap-3 w-max">
                            {abilityCards.map((ability) => (
                                <AbilitySlotPreview key={ability.id} ability={ability} onHover={handleCardHover} />
                            ))}
                        </div>
                    </div>
                )}
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
                <AbilityTooltip title={hoveredCard.ability.name} lines={hoveredCard.ability.getTooltipText()} />
            </div>,
            document.body,
        )}
        </>
    );
}
