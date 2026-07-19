import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from './CharacterSelectCornerPortrait';
import { CharacterSelectBottomAbilityList } from './CharacterSelectBottomAbilityList';
import { CharacterSelectLoadoutSelector } from './CharacterSelectLoadoutSelector';

/**
 * Center content for the loadout overview.
 * When `useLayoutSlots` is true, portrait/abilities live in BattleUISlotLayout bottom
 * slots; the center is the loadout selector. Otherwise (mobile/classic) portrait and
 * abilities stack around the selector.
 */
export function CharacterOverview({
    character,
    onChangeCharacter,
    useLayoutSlots = false,
}: {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
    useLayoutSlots?: boolean;
}) {
    if (useLayoutSlots) {
        return (
            <div className="flex min-h-0 flex-1 flex-col px-5 pb-2 pt-2">
                <CharacterSelectLoadoutSelector />
            </div>
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-2 pt-2">
            <div className="flex shrink-0 justify-center" style={{ height: 200 }}>
                <CharacterSelectCornerPortrait
                    character={character}
                    onChangeCharacter={onChangeCharacter}
                />
            </div>
            <div className="min-h-0 flex-1">
                <CharacterSelectLoadoutSelector />
            </div>
            <CharacterSelectBottomAbilityList character={character} />
        </div>
    );
}
