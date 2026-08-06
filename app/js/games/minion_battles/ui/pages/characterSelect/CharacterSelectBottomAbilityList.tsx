import React, { useMemo } from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { AbilityStatic } from '../../../abilities/Ability';
import { buildAccessibleAbilityIds } from '../../../storylines/questPrepLoadout';
import { AbilitySlotPreview } from '../../components/AbilitySlotPreview';

function useCharacterAbilityCards(character: CampaignCharacter): AbilityStatic[] {
    return useMemo((): AbilityStatic[] => {
        const ids = buildAccessibleAbilityIds(character.equipment, character.researchTrees);
        return ids.map((id) => getAbility(id)).filter((a): a is AbilityStatic => a != null);
    }, [character.equipment, character.researchTrees]);
}

interface CharacterSelectBottomAbilityListProps {
    character: CampaignCharacter;
}

/** Bottom strip of loadout ability cards for the overview (main) character-select view. */
export function CharacterSelectBottomAbilityList({ character }: CharacterSelectBottomAbilityListProps) {
    const abilityCards = useCharacterAbilityCards(character);
    const tooltipContext = useMemo(
        () => ({
            researchTrees: character.researchTrees,
            researchNodeLevels: character.researchNodeLevels,
        }),
        [character.researchTrees, character.researchNodeLevels],
    );

    return (
        <div className="flex h-full w-full min-h-0 items-center justify-center">
            {abilityCards.length === 0 ? (
                <p className="text-muted text-sm italic">No ability cards</p>
            ) : (
                <div className="overflow-x-auto max-w-full">
                    <div className="flex gap-3 w-max mx-auto items-center">
                        {abilityCards.map((ability) => (
                            <AbilitySlotPreview
                                key={ability.id}
                                ability={ability}
                                tooltipContext={tooltipContext}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
