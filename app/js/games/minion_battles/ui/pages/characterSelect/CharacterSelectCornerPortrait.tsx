import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';
import CharacterPortrait from '../../components/CharacterPortrait';

interface CharacterSelectCornerPortraitProps {
    character: CampaignCharacter;
    onChangeCharacter: () => void;
}

/** Bottom-left slot: Change Character above a square portrait + name. */
export function CharacterSelectCornerPortrait({
    character,
    onChangeCharacter,
}: CharacterSelectCornerPortraitProps) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || (portrait?.name ?? 'Character');

    return (
        <div className="flex h-full w-full min-h-0 flex-col items-center gap-1.5">
            <button
                type="button"
                className="shrink-0 px-3 py-1.5 rounded-lg border border-border-custom bg-surface text-xs font-medium text-muted hover:text-white hover:border-primary transition-colors cursor-pointer"
                onClick={onChangeCharacter}
            >
                Change character
            </button>
            <div
                className="min-h-0 flex-1 w-full overflow-hidden"
                style={{ containerType: 'size' }}
            >
                <div className="flex h-full w-full items-center justify-center">
                    <div
                        className="max-h-full overflow-hidden"
                        style={{ width: 'min(100cqw, 100cqh)' }}
                    >
                        <CharacterPortrait
                            picture={portrait?.picture ?? ''}
                            name={displayName}
                            selected
                            fill
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
