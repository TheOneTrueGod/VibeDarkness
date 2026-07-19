import React from 'react';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';
import { getPortrait } from '../../../character_defs/portraits';

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
                className="min-h-0 flex-1 w-full"
                style={{ containerType: 'size' }}
            >
                <div className="flex h-full w-full items-center justify-center">
                    <div
                        className="flex flex-col overflow-hidden rounded-lg bg-background border-2 border-green-500 shadow-[0_0_16px_rgba(34,197,94,0.35)]"
                        style={{
                            width: 'min(100cqw, 100cqh)',
                            height: 'min(100cqw, 100cqh)',
                        }}
                    >
                        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
                            {portrait?.picture
                                ? <img src={portrait.picture} alt={displayName} className="h-full w-full object-cover" />
                                : <span className="text-gray-500 text-sm">No portrait</span>
                            }
                        </div>
                        <div className="shrink-0 bg-surface-light px-2 py-1 text-center">
                            <span className="block truncate text-xs font-semibold text-white">{displayName}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
