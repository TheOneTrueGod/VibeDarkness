import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { CharacterSelectCornerPortrait } from './CharacterSelectCornerPortrait';
import { CharacterSelectBottomAbilityList } from './CharacterSelectBottomAbilityList';

/**
 * Center content for the loadout overview.
 * When `useLayoutSlots` is true, portrait/abilities live in BattleUISlotLayout bottom
 * slots and the center stays empty; otherwise (mobile/classic) they stack here.
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
        return <div className="flex-1 min-h-0" aria-hidden="true" />;
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col px-5 pb-2 pt-2 gap-4">
            <div className="flex justify-center shrink-0" style={{ height: 200 }}>
                <CharacterSelectCornerPortrait
                    character={character}
                    onChangeCharacter={onChangeCharacter}
                />
            </div>
            <CharacterSelectBottomAbilityList character={character} />
        </div>
    );
}
